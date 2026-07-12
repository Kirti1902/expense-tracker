# Ledger — Telegram Expense Tracker + Dashboard

Log expenses by texting a Telegram bot ("250 lunch"), then view a full report,
category breakdown, and budget progress on a local web dashboard.

## What's inside
- **Telegram bot** — free-text logging, auto-categorization, `/today`, `/month`,
  `/budgets`, `/setbudget`, `/undo`, `/report`.
- **Web dashboard** — charts, budget progress bars, filterable entry list.
- **PDF reports** — month-wise or year-wise, generated on request from the bot
  or downloaded from the dashboard.
- **SQLite database** — a single `expenses.db` file, no external database needed.

Both the bot and dashboard run from one process (`npm start`) and share the same
database, so anything you log on Telegram shows up on the dashboard instantly.

## 1. Get a Telegram bot token
1. Open Telegram, search for **@BotFather**.
2. Send `/newbot` and follow the prompts (choose a name and a username ending in `bot`).
3. BotFather gives you a token like `123456789:ABC-defGhIjkLmNoPQRstuVwxyz`. Save it.
4. Search for **@userinfobot**, message it, and note your numeric **user ID** —
   this restricts the bot to only respond to you.

## 2. Install and configure
```bash
cd expense-tracker
npm install
cp .env.example .env
```
Edit `.env` and fill in:
```
TELEGRAM_BOT_TOKEN=<your bot token>
TELEGRAM_OWNER_ID=<your telegram user id>
CURRENCY_SYMBOL=₹        # or $, €, £, etc.
```

## 3. Run it
```bash
npm start
```
You should see:
```
📊 Dashboard running at http://localhost:3000
🤖 Telegram bot is running...
```
Open **http://localhost:3000** for the dashboard. Open your bot in Telegram and
send `/start`.

## 4. Log expenses
Just message the bot naturally:
```
250 lunch
1200 groceries for the week
80 uber to office
```
The amount comes first, then a description. The category is auto-detected from
keywords (editable in `server/parser.js`) — or force one by adding it as the
last word, e.g. `500 concert tickets entertainment`.

### Bot commands
| Command | What it does |
|---|---|
| `/today` | Today's spending, itemized |
| `/month` | This month's totals by category |
| `/report month` | PDF report for the current month |
| `/report year` | PDF report for the current year |
| `/report 2026-07` | PDF report for a specific month |
| `/report 2026` | PDF report for a specific year |
| `/setbudget <category> <amount>` | Set a monthly budget, e.g. `/setbudget food 5000` |
| `/budgets` | View all budgets with progress bars |
| `/undo` | Delete your most recent entry |
| `/categories` | List all available categories |

Month-scale reports list every transaction; year-scale reports show a
month-by-month breakdown instead (to stay readable). Both include the full
category breakdown and total. You can also click **"Month PDF"** / **"Year
PDF"** on the dashboard to download the report for whatever period is
currently selected.

When you log an expense that pushes a category past 80% or 100% of its budget,
the bot warns you immediately.

## 5. Customize categories
Edit `CATEGORY_KEYWORDS` in `server/parser.js` to match your own spending
habits — add keywords, add new categories, or remove ones you don't use.

## Hosting

The Telegram bot talks to Telegram by polling — it does **not** need a public
URL to work. The only reason to host this online is if you want to check the
web dashboard from your phone or another device away from home. If you're
fine only viewing it on your own computer, you can just leave `npm start`
running on your PC or a Raspberry Pi on your home network and skip all of
this.

A `Dockerfile` is included, so any of these options work directly.

### Option A — Railway (recommended: easiest, ~$5/mo)
1. Push this project to a GitHub repo (private is fine).
2. On [railway.app](https://railway.app), **New Project → Deploy from GitHub repo**.
3. Add a **Volume**, mount it at `/app/data` (this is where `expenses.db` lives
   — without this, your data is wiped on every redeploy).
4. In **Variables**, add `TELEGRAM_BOT_TOKEN`, `TELEGRAM_OWNER_ID`,
   `CURRENCY_SYMBOL`, and `DATA_DIR=/app/data`.
5. Railway builds the `Dockerfile` automatically and gives you a public HTTPS
   URL for the dashboard.

### Option B — Fly.io (similar cost, more control)
1. Install `flyctl`, run `fly launch` in the project folder (it detects the
   Dockerfile).
2. Run `fly volumes create data --size 1` and mount it at `/app/data` in the
   generated `fly.toml`.
3. Set secrets: `fly secrets set TELEGRAM_BOT_TOKEN=... TELEGRAM_OWNER_ID=... DATA_DIR=/app/data`.
4. `fly deploy`.

### Option C — A cheap VPS (DigitalOcean, Hetzner, ~$4-6/mo, full control)
1. Spin up a small Ubuntu droplet.
2. Install Docker, then on the server:
   ```bash
   git clone <your repo>
   cd expense-tracker
   cp .env.example .env   # fill in your token/ID
   docker build -t expense-tracker .
   docker run -d --restart unless-stopped \
     -p 3000:3000 \
     -v $(pwd)/data:/app/data \
     --env-file .env \
     -e DATA_DIR=/app/data \
     expense-tracker
   ```
3. Put a reverse proxy in front (Caddy is easiest — it handles HTTPS
   automatically) pointing your domain at port 3000.

### Option D — Raspberry Pi / home server + Cloudflare Tunnel (free)
Best if you'd rather not pay monthly and don't mind your own hardware being
the "server."
1. Run the app on the Pi with `npm start` (or the Docker approach above) so it
   restarts on boot (`pm2` or a systemd service works well).
2. Install `cloudflared` and run a [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)
   pointed at `localhost:3000`. This gives you a public HTTPS URL for the
   dashboard without opening any ports on your router — good for keeping
   personal financial data off the open internet.

### A note on security
This app has no login screen — `TELEGRAM_OWNER_ID` restricts who can log
expenses via the bot, but the dashboard itself is unauthenticated. If you host
it publicly, put it behind a simple password (Caddy's `basicauth`, or a
Cloudflare Access policy on the tunnel) so a random link isn't enough to see
your spending.

## Project structure
```
expense-tracker/
├── index.js              # entry point — starts bot + dashboard together
├── Dockerfile             # for Railway/Fly.io/VPS deployment
├── server/
│   ├── bot.js              # Telegram bot commands & message handling
│   ├── api.js               # Express API for the dashboard
│   ├── db.js                # SQLite schema + queries
│   ├── parser.js             # "250 lunch" → {amount, category, note}
│   ├── report.js              # PDF report generation (pdfkit)
│   └── date-utils.js           # "month"/"year"/"2026-07" → date ranges
├── dashboard/
│   ├── index.html
│   ├── style.css
│   └── app.js
├── .env.example
└── package.json
```
