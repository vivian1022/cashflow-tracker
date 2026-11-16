const fmt = (n) => Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const palette = ['#2563eb', '#16a34a', '#dc2626', '#f59e0b', '#8b5cf6', '#0ea5e9', '#ec4899', '#84cc16', '#f97316', '#14b8a6'];

let direction = 'in';
let categories = [];
let weeklyChart = null;
let monthlyChart = null;

// ---------- helpers ----------
async function api(path, opts) {
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

document.getElementById('exportBtn').addEventListener('click', () => {
  window.location.href = '/api/export/csv';
});

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
  await loadCategories();
  await Promise.all([loadTransactions(), loadWeekly(), loadMonthly(), loadForecast()]);
})();
