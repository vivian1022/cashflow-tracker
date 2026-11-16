# 💰 Cashflow Tracker

A simple web application for SMEs to track daily money in/out by category, see weekly summaries, view charts, export CSV, and get a simple forecast for next month.

**Live app:** https://vivian1022.github.io/cashflow-tracker/

**Stack:** Pure static HTML/JS + Chart.js — no server, no database required.

## How it works

- The app runs entirely in your browser, hosted free on GitHub Pages.
- All transactions are saved in your browser's localStorage — nothing leaves your device.
- A yellow banner at the top reminds you when you're in this standalone mode.

## Features

- ➕ Add daily transactions: date, money in/out, amount, category, description
- 🗂 Preset SME categories (Product Sales, Rent, Salary & Wages, Utilities, …)
- 📅 Weekly summary table + chart (last 8 weeks): money in, out, and net
- 📊 Monthly stacked chart by category (last 6 months)
- 🔮 Next-month forecast: projected in/out/net with a likely range and per-category breakdown
- 📥 CSV export of all transactions for accounting

## Important notes

- Data is stored **per browser/device** — transactions entered on one computer won't appear on another.
- Clearing browser data/history will erase saved transactions. Use **Export CSV** regularly as a backup.
- To move data to another device: export CSV, keep it for accounting, or re-enter key transactions.

## Development

Everything lives in `public/` (`index.html`, `app.js`, `style.css`). Copies at the repo root serve GitHub Pages.

To run locally, just open `public/index.html` in a browser, or serve the folder:

```bash
npx serve public
```

Changes take effect on the live site a minute or two after `git push` to `main`.
