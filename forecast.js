// Simple, explainable next-month forecast:
// average daily rate over the lookback window x days in next month,
// with a +/- range based on weekly variability.

function daysInMonth(year, monthIndex0) {
  return new Date(year, monthIndex0 + 1, 0).getDate();
}

// Returns [inTotal, outTotal, perCategoryMap] totals over the window
function totalsByCategory(rows) {
  const perCat = {};
  let tin = 0;
  let tout = 0;
  for (const r of rows) {
    const amt = Number(r.amount);
    if (r.direction === 'in') tin += amt;
    else tout += amt;
    const key = r.category_name || 'Uncategorised';
    if (!perCat[key]) perCat[key] = { category: key, direction: r.direction, total: 0 };
    perCat[key].total += amt;
  }
  return { tin, tout, perCat: Object.values(perCat) };
}

function buildForecast(rows, now = new Date()) {
  if (!rows.length) {
    return {
      month: null,
      days: daysInMonth(now.getFullYear(), now.getMonth() + 1),
      dataPoints: 0,
      forecast_in: 0,
      forecast_out: 0,
      net: 0,
      range_in: [0, 0],
      range_out: [0, 0],
      by_category: [],
      note: 'No transactions recorded yet — add some data to see a forecast.',
    };
  }

  const dates = rows.map((r) => new Date(r.tx_date + 'T00:00:00Z').getTime());
  const firstDay = new Date(Math.min(...dates));
  const daysObserved = Math.max(
    1,
    Math.ceil((now.getTime() - firstDay.getTime()) / 86400000)
  );

  const { tin, tout, perCat } = totalsByCategory(rows);
  const dailyIn = tin / daysObserved;
  const dailyOut = tout / daysObserved;

  // Weekly variability for an honest range
  const weekly = new Map();
  for (const r of rows) {
    const d = new Date(r.tx_date + 'T00:00:00Z');
    const weekStart = new Date(d);
    weekStart.setUTCDate(d.getUTCDate() - d.getUTCDay());
    const key = weekStart.toISOString().slice(0, 10);
    if (!weekly.has(key)) weekly.set(key, { in: 0, out: 0 });
    const w = weekly.get(key);
    if (r.direction === 'in') w.in += Number(r.amount);
    else w.out += Number(r.amount);
  }
  const stdErr = (vals) => {
    if (vals.length < 2) return 0;
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const sd = Math.sqrt(
      vals.reduce((a, b) => a + (b - mean) ** 2, 0) / (vals.length - 1)
    );
    // scale weekly spread up to a monthly figure
    return (sd * 4.33) / Math.sqrt(vals.length);
  };
  const spreadIn = stdErr([...weekly.values()].map((w) => w.in));
  const spreadOut = stdErr([...weekly.values()].map((w) => w.out));

  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const days = daysInMonth(nextMonth.getFullYear(), nextMonth.getMonth());

  const forecastIn = dailyIn * days;
  const forecastOut = dailyOut * days;
  const scale = days / Math.max(1, daysObserved); // to scale category totals to a month

  return {
    month: nextMonth.toISOString().slice(0, 7),
    month_label: nextMonth.toLocaleString('en-US', { month: 'long', year: 'numeric' }),
    days,
    dataPoints: rows.length,
    observation_days: daysObserved,
    forecast_in: Math.round(forecastIn * 100) / 100,
    forecast_out: Math.round(forecastOut * 100) / 100,
    net: Math.round((forecastIn - forecastOut) * 100) / 100,
    range_in: [
      Math.round((forecastIn - spreadIn) * 100) / 100,
      Math.round((forecastIn + spreadIn) * 100) / 100,
    ],
    range_out: [
      Math.round((forecastOut - spreadOut) * 100) / 100,
      Math.round((forecastOut + spreadOut) * 100) / 100,
    ],
    by_category: perCat
      .map((c) => ({ ...c, forecast: Math.round(c.total * scale * 100) / 100 }))
      .sort((a, b) => b.forecast - a.forecast),
  };
}

module.exports = { buildForecast, daysInMonth };
