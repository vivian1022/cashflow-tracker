const express = require('express');
const path = require('path');
const db = require('./db');
const { buildForecast } = require('./forecast');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const num = (v) => (v === undefined || v === null || v === '' ? undefined : Number(v));

// ---------- Categories ----------
app.get('/api/categories', async (req, res) => {
  const { data, error } = await db
    .from('categories')
    .select('*')
    .order('direction')
    .order('name');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/categories', async (req, res) => {
  const { name, direction } = req.body || {};
  if (!name || !['in', 'out'].includes(direction)) {
    return res.status(400).json({ error: 'name and direction ("in"|"out") required' });
  }
  const { data, error } = await db
    .from('categories')
    .insert({ name: name.trim(), direction, is_preset: false })
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

// ---------- Transactions ----------
app.get('/api/transactions', async (req, res) => {
  const { from, to, limit } = req.query;
  let q = db
    .from('transactions')
    .select('id, tx_date, description, amount, direction, created_at, category_id, categories(name, direction)')
    .order('tx_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (from) q = q.gte('tx_date', from);
  if (to) q = q.lte('tx_date', to);
  if (limit) q = q.limit(Math.min(Number(limit) || 200, 1000));
  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/transactions', async (req, res) => {
  const { tx_date, description, amount, direction, category_id } = req.body || {};
  const amt = num(amount);
  if (!tx_date || !description || !amt || amt <= 0 || !['in', 'out'].includes(direction)) {
    return res.status(400).json({
      error: 'tx_date, description, positive amount and direction ("in"|"out") required',
    });
  }
  const { data, error } = await db
    .from('transactions')
    .insert({
      tx_date,
      description: String(description).trim(),
      amount: amt,
      direction,
      category_id: category_id || null,
    })
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

app.delete('/api/transactions/:id', async (req, res) => {
  const { error } = await db
    .from('transactions')
    .delete()
    .eq('id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.status(204).end();
});

// ---------- Weekly summary ----------
app.get('/api/summary/weekly', async (req, res) => {
  const weeks = Math.min(Number(req.query.weeks) || 8, 52);
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - start.getDay() - (weeks - 1) * 7); // Sunday of first week
  const startStr = start.toISOString().slice(0, 10);

  const { data, error } = await db
    .from('transactions')
    .select('tx_date, amount, direction')
    .gte('tx_date', startStr);
  if (error) return res.status(500).json({ error: error.message });

  const buckets = new Map();
  for (let i = 0; i < weeks; i++) {
    const ws = new Date(start);
    ws.setDate(start.getDate() + i * 7);
    const we = new Date(ws);
    we.setDate(ws.getDate() + 6);
    buckets.set(ws.toISOString().slice(0, 10), {
      week_start: ws.toISOString().slice(0, 10),
      week_end: we.toISOString().slice(0, 10),
      money_in: 0,
      money_out: 0,
      net: 0,
    });
  }
  for (const r of data) {
    const d = new Date(r.tx_date + 'T00:00:00Z');
    const ws = new Date(d);
    ws.setUTCDate(d.getUTCDate() - d.getUTCDay());
    const b = buckets.get(ws.toISOString().slice(0, 10));
    if (!b) continue;
    const amt = Number(r.amount);
    if (r.direction === 'in') b.money_in += amt;
    else b.money_out += amt;
  }
  const result = [...buckets.values()].map((b) => ({
    ...b,
    net: Math.round((b.money_in - b.money_out) * 100) / 100,
    money_in: Math.round(b.money_in * 100) / 100,
    money_out: Math.round(b.money_out * 100) / 100,
  }));
  res.json(result);
});

// ---------- Monthly summary by category ----------
app.get('/api/summary/monthly', async (req, res) => {
  const months = Math.min(Number(req.query.months) || 6, 24);
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
  const startStr = start.toISOString().slice(0, 10);

  const { data, error } = await db
    .from('transactions')
    .select('tx_date, amount, direction, categories(name)')
    .gte('tx_date', startStr);
  if (error) return res.status(500).json({ error: error.message });

  const buckets = new Map();
  for (const r of data) {
    const month = r.tx_date.slice(0, 7);
    if (!buckets.has(month)) {
      buckets.set(month, { month, money_in: 0, money_out: 0, by_category: {} });
    }
    const b = buckets.get(month);
    const amt = Number(r.amount);
    if (r.direction === 'in') b.money_in += amt;
    else b.money_out += amt;
    const cat = (r.categories && r.categories.name) || 'Uncategorised';
    b.by_category[cat] = (b.by_category[cat] || 0) + amt;
  }
  const result = [...buckets.values()]
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((b) => ({
      month: b.month,
      money_in: Math.round(b.money_in * 100) / 100,
      money_out: Math.round(b.money_out * 100) / 100,
      net: Math.round((b.money_in - b.money_out) * 100) / 100,
      by_category: Object.fromEntries(
        Object.entries(b.by_category).map(([k, v]) => [k, Math.round(v * 100) / 100])
      ),
    }));
  res.json(result);
});

// ---------- Forecast ----------
app.get('/api/forecast', async (req, res) => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1 - 90); // last ~90 days
  const startStr = start.toISOString().slice(0, 10);
  const { data, error } = await db
    .from('transactions')
    .select('tx_date, amount, direction, categories(name)')
    .gte('tx_date', startStr)
    .order('tx_date');
  if (error) return res.status(500).json({ error: error.message });
  res.json(buildForecast(data, now));
});

// ---------- CSV export ----------
app.get('/api/export/csv', async (req, res) => {
  const { from, to } = req.query;
  let q = db
    .from('transactions')
    .select('tx_date, description, amount, direction, categories(name)')
    .order('tx_date');
  if (from) q = q.gte('tx_date', from);
  if (to) q = q.lte('tx_date', to);
  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });

  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = ['Date,Description,Category,Direction,Amount'];
  for (const r of data) {
    lines.push(
      [r.tx_date, esc(r.description), esc(r.categories?.name || ''), r.direction, r.amount].join(',')
    );
  }
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="transactions-${new Date().toISOString().slice(0, 10)}.csv"`
  );
  res.send(lines.join('\n'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Cashflow tracker running at http://localhost:${PORT}`);
});
