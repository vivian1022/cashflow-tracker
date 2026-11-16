const fmt = (n) => Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const palette = ['#2563eb', '#16a34a', '#dc2626', '#f59e0b', '#8b5cf6', '#0ea5e9', '#ec4899', '#84cc16', '#f97316', '#14b8a6'];

let direction = 'in';
let categories = [];
let weeklyChart = null;
let monthlyChart = null;

// ---------- local (offline) mode ----------
// When the app is hosted on GitHub Pages there is no backend, so data is
// stored in the browser's localStorage. Mode is detected at startup.
const LS_KEY = 'cashflow-tracker-data';
let localMode = false;

const PRESET_CATEGORIES = [
  { id: 1, name: 'Product Sales', direction: 'in', is_preset: true },
  { id: 2, name: 'Service Revenue', direction: 'in', is_preset: true },
  { id: 3, name: 'Other Income', direction: 'in', is_preset: true },
  { id: 4, name: 'Rent', direction: 'out', is_preset: true },
  { id: 5, name: 'Salary & Wages', direction: 'out', is_preset: true },
  { id: 6, name: 'Utilities', direction: 'out', is_preset: true },
  { id: 7, name: 'Supplies & Inventory', direction: 'out', is_preset: true },
  { id: 8, name: 'Marketing', direction: 'out', is_preset: true },
  { id: 9, name: 'Equipment', direction: 'out', is_preset: true },
  { id: 10, name: 'Taxes & Licenses', direction: 'out', is_preset: true },
  { id: 11, name: 'Transport & Delivery', direction: 'out', is_preset: true },
  { id: 12, name: 'Other Expense', direction: 'out', is_preset: true },
];

function loadLocal() {
  const raw = localStorage.getItem(LS_KEY);
  if (!raw) return { categories: PRESET_CATEGORIES, transactions: [], nextCatId: 13 };
  const d = JSON.parse(raw);
  if (!d.categories?.length) d.categories = PRESET_CATEGORIES;
  if (!d.nextCatId) d.nextCatId = Math.max(...d.categories.map((c) => c.id)) + 1;
  return d;
}
function saveLocal(d) {
  localStorage.setItem(LS_KEY, JSON.stringify(d));
}
let localData = null;

function catName(id) {
  const c = localData.categories.find((c) => c.id === id);
  return c ? c.name : null;
}

// localStorage-backed replacements for the server API (same shapes)
const localApi = {
  async categories() {
    return [...localData.categories].sort((a, b) =>
      a.direction === b.direction ? a.name.localeCompare(b.name) : a.direction.localeCompare(b.direction)
    );
  },
  async addCategory({ name, direction }) {
    name = name.trim();
    if (localData.categories.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
      throw new Error('Category already exists');
    }
    const cat = { id: localData.nextCatId++, name, direction, is_preset: false };
    localData.categories.push(cat);
    saveLocal(localData);
    return cat;
  },
  async transactions({ limit } = {}) {
    const rows = [...localData.transactions]
      .sort((a, b) => b.tx_date.localeCompare(a.tx_date) || b.created_at.localeCompare(a.created_at));
    return limit ? rows.slice(0, limit) : rows;
  },
  async addTransaction(t) {
    const tx = {
      id: crypto.randomUUID(),
      tx_date: t.tx_date,
      description: String(t.description).trim(),
      amount: Number(t.amount),
      direction: t.direction,
      category_id: t.category_id || null,
      created_at: new Date().toISOString(),
    };
    localData.transactions.push(tx);
    saveLocal(localData);
    return tx;
  },
  async deleteTransaction(id) {
    localData.transactions = localData.transactions.filter((t) => t.id !== id);
    saveLocal(localData);
  },
  async weeklySummary(weeks) {
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - start.getDay() - (weeks - 1) * 7);
    const buckets = [];
    for (let i = 0; i < weeks; i++) {
      const ws = new Date(start);
      ws.setDate(start.getDate() + i * 7);
      const we = new Date(ws);
      we.setDate(ws.getDate() + 6);
      buckets.push({
        week_start: iso(ws), week_end: iso(we), money_in: 0, money_out: 0, net: 0,
      });
    }
    for (const r of localData.transactions) {
      const d = new Date(r.tx_date + 'T00:00:00');
      const ws = new Date(d);
      ws.setDate(d.getDate() - d.getDay());
      const b = buckets.find((b) => b.week_start === iso(ws));
      if (!b) continue;
      if (r.direction === 'in') b.money_in += r.amount; else b.money_out += r.amount;
    }
    return buckets.map(roundRow);
  },
  async monthlySummary(months) {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
    const firstKey = iso(start).slice(0, 7);
    const buckets = new Map();
    for (const r of localData.transactions) {
      const month = r.tx_date.slice(0, 7);
      if (month < firstKey) continue;
      if (!buckets.has(month)) buckets.set(month, { month, money_in: 0, money_out: 0, by_category: {} });
      const b = buckets.get(month);
      if (r.direction === 'in') b.money_in += r.amount; else b.money_out += r.amount;
      const cat = catName(r.category_id) || 'Uncategorised';
      b.by_category[cat] = (b.by_category[cat] || 0) + r.amount;
    }
    return [...buckets.values()]
      .sort((a, b) => a.month.localeCompare(b.month))
      .map((b) => ({
        ...roundRow(b),
        by_category: Object.fromEntries(Object.entries(b.by_category).map(([k, v]) => [k, round2(v)])),
      }));
  },
  async forecast() {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1 - 90);
    const rows = localData.transactions
      .filter((r) => r.tx_date >= iso(start))
      .sort((a, b) => a.tx_date.localeCompare(b.tx_date))
      .map((r) => ({ ...r, category_name: catName(r.category_id) }));
    return buildForecastLocal(rows, now);
  },
  async exportCsv() {
    const rows = [...localData.transactions].sort((a, b) => a.tx_date.localeCompare(b.tx_date));
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = ['Date,Description,Category,Direction,Amount'];
    for (const r of rows) {
      lines.push([r.tx_date, esc(r.description), esc(catName(r.category_id) || ''), r.direction, r.amount].join(','));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `transactions-${iso(new Date())}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  },
};

const iso = (d) => {
  const tz = d.getTimezoneOffset();
  return new Date(d.getTime() - tz * 60000).toISOString().slice(0, 10);
};
const round2 = (n) => Math.round(n * 100) / 100;
const roundRow = (b) => ({
  ...b,
  money_in: round2(b.money_in),
  money_out: round2(b.money_out),
  net: round2(b.money_in - b.money_out),
});

// Local version of the server's forecast logic
function buildForecastLocal(rows, now) {
  if (!rows.length) {
    return { month: null, dataPoints: 0, forecast_in: 0, forecast_out: 0, net: 0,
      range_in: [0, 0], range_out: [0, 0], by_category: [],
      note: 'No transactions recorded yet — add some data to see a forecast.' };
  }
  const dates = rows.map((r) => new Date(r.tx_date + 'T00:00:00').getTime());
  const daysObserved = Math.max(1, Math.ceil((now.getTime() - Math.min(...dates)) / 86400000));
  let tin = 0, tout = 0;
  const perCat = {};
  for (const r of rows) {
    if (r.direction === 'in') tin += r.amount; else tout += r.amount;
    const key = r.category_name || 'Uncategorised';
    (perCat[key] ??= { category: key, direction: r.direction, total: 0 }).total += r.amount;
  }
  const dailyIn = tin / daysObserved, dailyOut = tout / daysObserved;
  const weekly = new Map();
  for (const r of rows) {
    const d = new Date(r.tx_date + 'T00:00:00');
    const ws = new Date(d); ws.setDate(d.getDate() - d.getDay());
    const key = iso(ws);
    const w = weekly.get(key) ?? { in: 0, out: 0 };
    if (r.direction === 'in') w.in += r.amount; else w.out += r.amount;
    weekly.set(key, w);
  }
  const stdErr = (vals) => {
    if (vals.length < 2) return 0;
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / (vals.length - 1));
    return (sd * 4.33) / Math.sqrt(vals.length);
  };
  const spreadIn = stdErr([...weekly.values()].map((w) => w.in));
  const spreadOut = stdErr([...weekly.values()].map((w) => w.out));
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const days = new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 1, 0).getDate();
  const fin = dailyIn * days, fout = dailyOut * days;
  const scale = days / Math.max(1, daysObserved);
  return {
    month: iso(nextMonth).slice(0, 7),
    month_label: nextMonth.toLocaleString('en-US', { month: 'long', year: 'numeric' }),
    days, dataPoints: rows.length, observation_days: daysObserved,
    forecast_in: round2(fin), forecast_out: round2(fout), net: round2(fin - fout),
    range_in: [round2(fin - spreadIn), round2(fin + spreadIn)],
    range_out: [round2(fout - spreadOut), round2(fout + spreadOut)],
    by_category: Object.values(perCat)
      .map((c) => ({ ...c, forecast: round2(c.total * scale) }))
      .sort((a, b) => b.forecast - a.forecast),
  };
}

// ---------- helpers ----------
async function api(path, opts) {
  // In local mode there is no backend; route to the localStorage implementations.
  if (localMode) {
    if (path.startsWith('/api/categories')) {
      if (opts?.method === 'POST') return localApi.addCategory(JSON.parse(opts.body));
      return localApi.categories();
    }
    if (path.startsWith('/api/transactions/')) return localApi.deleteTransaction(path.split('/')[3]);
    if (path.startsWith('/api/transactions')) {
      if (opts?.method === 'POST') return localApi.addTransaction(JSON.parse(opts.body));
      return localApi.transactions({ limit: Number(new URL(path, 'http://x').searchParams.get('limit')) });
    }
    if (path.startsWith('/api/summary/weekly')) return localApi.weeklySummary(Number(new URL(path, 'http://x').searchParams.get('weeks')) || 8);
    if (path.startsWith('/api/summary/monthly')) return localApi.monthlySummary(Number(new URL(path, 'http://x').searchParams.get('months')) || 6);
    if (path.startsWith('/api/forecast')) return localApi.forecast();
    if (path.startsWith('/api/export/csv')) return localApi.exportCsv();
  }
  const res = await fetch(path, opts);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || res.statusText);
  }
  return res.status === 204 ? null : res.json();
}

// ---------- form ----------
function setDirection(d) {
  direction = d;
  document.getElementById('dirIn').className = 'toggle-btn active ' + (d === 'in' ? 'in' : '');
  document.getElementById('dirOut').className = 'toggle-btn active ' + (d === 'out' ? 'out' : '');
  renderCategoryOptions();
}

function renderCategoryOptions() {
  const sel = document.getElementById('txCategory');
  sel.innerHTML = categories
    .filter((c) => c.direction === direction)
    .map((c) => `<option value="${c.id}">${c.name}</option>`)
    .join('');
}

document.getElementById('dirIn').addEventListener('click', () => setDirection('in'));
document.getElementById('dirOut').addEventListener('click', () => setDirection('out'));

document.getElementById('txForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = document.getElementById('txMsg');
  try {
    await api('/api/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tx_date: document.getElementById('txDate').value,
        description: document.getElementById('txDesc').value,
        amount: document.getElementById('txAmount').value,
        direction,
        category_id: Number(document.getElementById('txCategory').value) || null,
      }),
    });
    msg.textContent = 'Saved ✓';
    msg.className = 'msg ok';
    e.target.reset();
    document.getElementById('txDate').valueAsDate = new Date();
    await Promise.all([loadTransactions(), loadWeekly(), loadMonthly(), loadForecast()]);
  } catch (err) {
    msg.textContent = err.message;
    msg.className = 'msg err';
  }
  setTimeout(() => (msg.textContent = ''), 3000);
});

document.getElementById('exportBtn').addEventListener('click', () => api('/api/export/csv'));

// ---------- data loading ----------
async function loadCategories() {
  categories = await api('/api/categories');
  renderCategoryOptions();
}

async function loadTransactions() {
  const rows = await api('/api/transactions?limit=50');
  const tbody = document.querySelector('#txTable tbody');
  tbody.innerHTML = rows
    .map((r) => {
      const cat = r.categories ? r.categories.name : '—';
      return `<tr>
        <td>${r.tx_date}</td>
        <td>${r.description}</td>
        <td>${cat}</td>
        <td class="${r.direction}">${r.direction === 'in' ? 'In' : 'Out'}</td>
        <td class="r ${r.direction}">${fmt(r.amount)}</td>
        <td><button class="del" data-id="${r.id}" title="Delete">✕</button></td>
      </tr>`;
    })
    .join('');
  tbody.querySelectorAll('.del').forEach((btn) =>
    btn.addEventListener('click', async () => {
      await api(`/api/transactions/${btn.dataset.id}`, { method: 'DELETE' });
      await Promise.all([loadTransactions(), loadWeekly(), loadMonthly(), loadForecast()]);
    })
  );
}

async function loadWeekly() {
  const weeks = await api('/api/summary/weekly?weeks=8');
  const tbody = document.querySelector('#weeklyTable tbody');
  tbody.innerHTML = weeks
    .map((w) => `<tr>
      <td>${w.week_start} – ${w.week_end}</td>
      <td class="in">${fmt(w.money_in)}</td>
      <td class="out">${fmt(w.money_out)}</td>
      <td class="r ${w.net < 0 ? 'neg' : 'pos'}">${fmt(w.net)}</td>
    </tr>`)
    .join('');

  const ctx = document.getElementById('weeklyChart');
  if (weeklyChart) weeklyChart.destroy();
  weeklyChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: weeks.map((w) => w.week_start),
      datasets: [
        { label: 'Money In', data: weeks.map((w) => w.money_in), backgroundColor: '#16a34a' },
        { label: 'Money Out', data: weeks.map((w) => w.money_out), backgroundColor: '#dc2626' },
        { label: 'Net', data: weeks.map((w) => w.net), type: 'line', borderColor: '#2563eb', backgroundColor: '#2563eb', tension: 0.3 },
      ],
    },
    options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } },
  });
}

async function loadMonthly() {
  const months = await api('/api/summary/monthly?months=6');
  const catNames = [...new Set(months.flatMap((m) => Object.keys(m.by_category)))];
  const datasets = catNames.map((cat, i) => ({
    label: cat,
    data: months.map((m) => m.by_category[cat] || 0),
    backgroundColor: palette[i % palette.length],
  }));
  const ctx = document.getElementById('monthlyChart');
  if (monthlyChart) monthlyChart.destroy();
  monthlyChart = new Chart(ctx, {
    type: 'bar',
    data: { labels: months.map((m) => m.month), datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } },
    },
  });
  document.getElementById('monthlyLegend').innerHTML = catNames
    .map((c, i) => `<span style="color:${palette[i % palette.length]}">${c}</span>`)
    .join('');
}

async function loadForecast() {
  const f = await api('/api/forecast');
  const el = document.getElementById('forecastBody');
  if (!f.month) {
    el.innerHTML = `<p class="range">${f.note}</p>`;
    return;
  }
  const catRows = f.by_category
    .slice(0, 6)
    .map((c) => `<tr><td>${c.category}</td><td class="r ${c.direction}">${fmt(c.forecast)}</td></tr>`)
    .join('');
  el.innerHTML = `
    <div class="row"><span>Projected Money In</span><strong class="in">${fmt(f.forecast_in)}</strong></div>
    <div class="range">likely range: ${fmt(f.range_in[0])} – ${fmt(f.range_in[1])}</div>
    <div class="row"><span>Projected Money Out</span><strong class="out">${fmt(f.forecast_out)}</strong></div>
    <div class="range">likely range: ${fmt(f.range_out[0])} – ${fmt(f.range_out[1])}</div>
    <div class="big ${f.net < 0 ? 'out' : 'in'}">Net: ${fmt(f.net)}</div>
    <div class="range">Based on ${f.dataPoints} transactions over ${f.observation_days} days · ${f.month_label}</div>
    ${catRows ? `<table><tbody>${catRows}</tbody></table>` : ''}
  `;
}

// ---------- init ----------
(async function init() {
  document.getElementById('txDate').valueAsDate = new Date();
  setDirection('in');
  // Hosted on GitHub Pages (no backend) -> use localStorage mode.
  localMode = location.hostname.endsWith('.github.io') || location.protocol === 'file:';
  if (localMode) {
    localData = loadLocal();
    const banner = document.createElement('div');
    banner.style.cssText = 'background:#fef9c3;border-bottom:1px solid #e2e8f0;padding:8px 24px;font-size:13px;text-align:center';
    banner.textContent = '📦 Standalone mode — data is saved in this browser only. Clearing browser data will erase it.';
    document.body.prepend(banner);
  }
  await loadCategories();
  await Promise.all([loadTransactions(), loadWeekly(), loadMonthly(), loadForecast()]);
})();
