# 💰 Cashflow Tracker

A simple web application for SMEs to track daily money in/out by category, see weekly summaries, view charts, export CSV, and get a simple forecast for next month.

**Stack:** Express (Node.js) · Supabase (cloud PostgreSQL) · vanilla JS + Chart.js

## How it works

- The **code** lives in this GitHub repository.
- The **data** lives in a free Supabase project (cloud Postgres database).
- The Node server talks to Supabase with a service-role key and serves the dashboard at `http://localhost:3000`.

## Features

- ➕ Add daily transactions: date, money in/out, amount, category, description
- 🗂 Preset SME categories (Product Sales, Rent, Salary & Wages, Utilities, …) plus custom categories
- 📅 Weekly summary table + chart (last 8 weeks): money in, out, and net
- 📊 Monthly stacked chart by category (last 6 months)
- 🔮 Next-month forecast: projected in/out/net with a likely range and per-category breakdown
- 📥 CSV export of all transactions for accounting

## Setup

### 1. Create the database (Supabase, free)

1. Go to [supabase.com](https://supabase.com) → sign up → **New project**.
2. Once created, open **SQL Editor** → paste the contents of [`schema.sql`](./schema.sql) → **Run**.
   This creates the tables and seeds 12 preset SME categories.
3. Go to **Project Settings → API** and copy:
   - **Project URL**
   - **service_role secret key** (keep this private!)

### 2. Configure and run the app

```bash
cp .env.example .env
# edit .env with your Supabase URL and service-role key
npm install
npm start
```

Open http://localhost:3000 — start adding transactions.

### 3. Push the code to GitHub

```bash
git remote add origin https://github.com/YOUR-USERNAME/cashflow-tracker.git
git branch -M main
git push -u origin main
```

(If you cloned this repo, `origin` is already set — just `git push`.)

## API

| Endpoint | Description |
|---|---|
| `GET /api/categories` | List categories |
| `POST /api/categories` | Add custom category `{name, direction}` |
| `GET /api/transactions?from=&to=&limit=` | List transactions |
| `POST /api/transactions` | Add `{tx_date, description, amount, direction, category_id}` |
| `DELETE /api/transactions/:id` | Delete a transaction |
| `GET /api/summary/weekly?weeks=8` | Weekly in/out/net |
| `GET /api/summary/monthly?months=6` | Monthly totals per category |
| `GET /api/forecast` | Next-month forecast |
| `GET /api/export/csv?from=&to=` | CSV download |

## Forecast method

The forecast is intentionally simple and explainable: it averages the daily money-in and money-out rates over the last ~90 days, multiplies by the number of days in next month, and adds a "likely range" based on weekly variability. Per-category forecasts scale each category's observed share to a month.

## Security notes

- `.env` is git-ignored — never commit the service-role key.
- Row Level Security is enabled on both tables so the public anon key can't touch the data; only the server (service-role key) can.
