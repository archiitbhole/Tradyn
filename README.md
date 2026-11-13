<p align="center"><img src="brand-kit/tradyn-logo-on-dark.png" alt="Tradyn" height="160"></p>

# Tradyn

An Indian stock-market research dashboard for **NSE and BSE**: NIFTY 50, SENSEX, BANK NIFTY, individual
shares, sectors, charts, watchlists and market insights. It also includes the **Tradyn Simulator**, a separate
rule-based artificial market for learning, kept visually and technically apart from the real market data.

Built with Next.js (App Router) · React · TypeScript · Tailwind CSS · shadcn/ui-style components · Lucide icons ·
TradingView Lightweight Charts · Recharts · Supabase (PostgreSQL) · deployable on Vercel.

B.Tech First Year · CSE (AI & DS) — Archit Bhole · Palak Dhoot · Darsheel Chajed · Anshuman Kulkarni ·
guided by Nikhil Soniminde.

---

## Contents

1. [What is in the app](#1-what-is-in-the-app)
2. [How market data works](#2-how-market-data-works)
3. [Run it locally](#3-run-it-locally)
4. [Market-data credentials](#4-market-data-credentials)
5. [Supabase (accounts and saved watchlists)](#5-supabase-accounts-and-saved-watchlists)
6. [Deploy on Vercel](#6-deploy-on-vercel)
7. [API](#7-api)
8. [Testing](#8-testing)
9. [Project structure](#9-project-structure)
10. [Branding and icons](#10-branding-and-icons)
11. [Security](#11-security)
12. [Limitations](#12-limitations)

---

## 1. What is in the app

| Section | What it shows |
|---|---|
| **Overview** | NIFTY 50, SENSEX and BANK NIFTY with intraday sparklines; market status; advances, declines and unchanged; average move; India VIX (when the source provides it); sector performance; top gainers, losers, most active (value traded) and highest volume; a watchlist preview. |
| **Markets** | NSE/BSE selector, search, sector filter, sorting by any column, pagination. Columns: symbol, company, last price, change, change %, volume, day high, day low, previous close. A dash means the source sent no value — nothing is estimated. |
| **Watchlist** | Several watchlists: create, rename, delete, add and remove shares, live prices and day changes, open a share. Saved to your account with Supabase, or in the browser when accounts are not set up. |
| **Stock Explorer** | Browse the tracking list by sector, recently viewed shares and search. |
| **Stock Details** | One page per share or index (`/stocks/NSE:RELIANCE`): price, change, previous close, open, high, low, volume, day range, candlestick or line chart with volume, ranges 1D 1W 1M 3M 6M 1Y 5Y, price history table, data source and price time. |
| **Market Insights** | Breadth, sector performance, relative performance, volume analysis, volatility (India VIX, day ranges), the NIFTY 50 trend against its moving averages. Measured figures are labelled **Measured**; written readings are labelled as interpretation. No predictions. |
| **Tradyn Simulator** | The original rule-based market: four trader strategies, market events, live price and order-flow charts, leaderboard, portfolio analysis, every trader, the Experiment Lab (scenarios and trader-mix sweep) and CSV export. A permanent **SIMULATION MODE** banner is shown; it never touches real data. |
| **Settings** | Light / dark / device theme, price-update speed, which data sources are configured (names of missing settings only), account, about. |

The interface is desktop-first with a collapsible sidebar, and has a bottom bar and menu drawer on phones. It
was checked for sideways scrolling at 320–1440 px wide.

## 2. How market data works

```
Browser ──(polling, own /api routes only)──► Next.js API routes (serverless, stateless)
                                                 │  validation (Zod) · rate limit · safe errors
                                                 ▼
                                      market-data service ── per-instance cache + CDN cache
                                                 │
                     ┌───────────────────────────┼──────────────────────────┐
                     ▼                           ▼                          ▼
           Angel One SmartAPI            Groww Trade API            Yahoo Finance chart feed
           (official, your account)      (official, your account)   (unofficial, optional fallback)
```

* **One provider interface** (`src/lib/providers/types.ts`): `getQuote`, `getQuotes`, `getHistoricalCandles`,
  `searchStocks`, `getMarketStatus`, `getMarketMovers`. Each source is one file in `src/lib/providers/`.
* **Choosing a source:** `MARKET_DATA_PROVIDER=angelone|groww|yahoo`. When it is empty, Tradyn picks Angel
  One if its four settings exist, then Groww, then Yahoo.
* **Credentials stay on the server.** Broker sign-in (including the TOTP code) happens inside the API
  routes. The browser only ever talks to this app's own `/api/*` routes.
* **Expired sessions** are detected (HTTP 401/403 and the brokers' session error codes), and the server signs in
  again once. Concurrent requests share one sign-in. Broker tokens can be shared across serverless instances
  through Supabase (`provider_sessions`, service role only).
* **Every quote says where it came from and how fresh it is:** source name, price time (IST) and one of
  *Live* (official feed, traded within 2 minutes), *Delayed* (Yahoo), *Stale* (no new price for over 2 minutes
  while the market is open) or *Last close* (market closed).
* **No made-up data.** There is no simulated or random price path for market pages. When a source fails, the
  page says why (not set up, sign-in refused, unreachable, rate-limited, error) and offers *Try again*. If the
  Yahoo fallback is allowed (`YAHOO_FALLBACK`), it may answer instead and a notice on the page names the
  source that failed and the reason. The switch is never silent.
* **Caching:** short per-instance caches (5 s for broker quotes and 20 s for Yahoo while the market is open,
  longer when it is closed), plus `Cache-Control: s-maxage` so Vercel's CDN shares replies between visitors.
* **Rate limiting:** per IP per minute, generous for data (600, because classrooms and offices share one IP) and
  strict for sign-in (10). Upstream calls are limited by concurrency (2 for Angel One, 5 for Groww, 8 for Yahoo)
  and every call has a timeout, so a slow provider cannot keep a serverless function running.
* **Rankings** (gainers, losers, breadth, sectors) are computed over the **Tradyn 100**, Tradyn's own list of
  about 100 large NSE companies with sector labels (`src/data/tracked.ts`). It is not an official index; none of
  these sources offers a whole-market ranking in one request. Groww prices 40 of them per refresh (one request
  per share) and Yahoo 50, taking an even spread across sectors.
* **The full NSE/BSE share list** (for search and *All shares*) comes from Angel One's public instrument
  master, downloaded before every build (`npm run instruments:sync`, run automatically as `prebuild`). If the
  download fails, the build keeps the previous list, or falls back to the Tradyn 100.
* **Real time:** prices refresh by controlled polling (about every 10 s for quotes and 20 s for lists while the
  market is open, every few minutes when it is closed, and paused while the tab is hidden). Vercel functions
  cannot hold a permanent WebSocket. Tick-by-tick streaming would need a separate always-on service (for example
  a small worker on Fly.io or Railway connected to the broker's WebSocket feed, publishing through Supabase
  Realtime). That is not included.

## 3. Run it locally

Needs **Node.js 20.9 or newer**.

```bash
npm ci                              # exact versions from package-lock.json
cp .env.example .env.local          # then fill in what you use (see below) — never commit .env.local
npm run dev                         # http://localhost:3000
```

With no settings at all, the market pages use Yahoo Finance (unofficial and may be delayed). The simulator
works without any settings or internet.

| Script | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build (syncs the instrument list first) / serve it |
| `npm run instruments:sync` | Download the latest NSE/BSE share list from Angel One's public instrument master |
| `npm run lint` · `npm run typecheck` | ESLint · TypeScript |
| `npm test` | Unit tests (Vitest) |
| `npm run test:e2e` | Browser and API tests against the production build (Playwright) |
| `npm run check` | lint + typecheck + unit tests + build |

## 4. Market-data credentials

All variables are listed in **`.env.example`** with instructions. None of them uses the `NEXT_PUBLIC_` prefix
(that would send them to the browser), so never add it.

### Angel One SmartAPI (official, free with an Angel One account)

| Variable | Where it comes from |
|---|---|
| `ANGEL_API_KEY` | [smartapi.angelone.in](https://smartapi.angelone.in) → sign in → create an app → its API key |
| `ANGEL_CLIENT_CODE` | Your Angel One client ID |
| `ANGEL_MPIN` | Your 4-digit login MPIN |
| `ANGEL_TOTP_SECRET` | Enable TOTP for your account on the SmartAPI site; the text secret behind the QR code (base32) |

Tradyn generates the 6-digit TOTP code itself, so a deployment can sign in unattended. Optional:
`ANGEL_LOCAL_IP`, `ANGEL_PUBLIC_IP`, `ANGEL_MAC_ADDRESS` (request headers Angel One asks for).

### Groww Trade API (official, needs a Trading API subscription)

Create keys at [groww.in/trade-api](https://groww.in/trade-api). Use **one** sign-in method:

| Method | Variables | Notes |
|---|---|---|
| TOTP key (recommended) | `GROWW_API_KEY` + `GROWW_TOTP_SECRET` | Renews itself every day |
| Approval key | `GROWW_API_KEY` + `GROWW_API_SECRET` | Must be approved on Groww every day |
| Access token | `GROWW_ACCESS_TOKEN` | Expires every morning at 06:00 IST |

### Yahoo Finance (no account)

Unofficial public chart feed. NSE/BSE prices on it may be **delayed** and are **not guaranteed to be real-time**,
and it can change or block requests without notice. `YAHOO_ENABLED=false` switches it off completely;
`YAHOO_FALLBACK=false` stops it from standing in for a failing broker API.

Not included, deliberately: Moneycontrol (no public API; scraping is against its terms) and Sharekhan (its API
needs a browser-redirect sign-in and WebSocket-only prices, which does not fit serverless functions).

Respect each provider's API terms, licensing and rate limits. Broker API data is for your own use under your
account agreement.

## 5. Supabase (accounts and saved watchlists)

Without Supabase the whole app works, and watchlists are saved in each browser. To save them to accounts:

1. Create a project at [supabase.com](https://supabase.com).
2. **SQL Editor** → paste `supabase/schema.sql` → **Run**. This creates `watchlists`, `watchlist_items` (with
   Row Level Security: every user sees only their own rows) and the optional `provider_sessions` table.
3. **Project Settings → API** → copy into your environment:
   * `SUPABASE_URL` — Project URL
   * `SUPABASE_ANON_KEY` — the `anon` public key (used on the server only, together with RLS)
   * `SUPABASE_SERVICE_ROLE_KEY` — optional; lets all server instances share one broker sign-in. Keep it secret.
4. **Authentication → URL Configuration** → set *Site URL* to your deployment URL and add
   `https://<your-domain>/auth/callback` to the redirect URLs (used by the email-confirmation link).
5. Email + password sign-in is enabled by default in Supabase. Sign up from **Settings → Account** in Tradyn.

The session is kept in httpOnly cookies set by Tradyn's own routes. The browser never receives a Supabase key.

## 6. Deploy on Vercel

1. Push this folder to a GitHub repository (`.gitignore` already excludes `.env*`, `.next`, `node_modules`).
2. [vercel.com/new](https://vercel.com/new) → import the repository. Vercel detects Next.js: keep the default
   build command (`npm run build`) and output.
3. **Settings → Environment Variables**: add the variables you use from `.env.example` (for Production, and
   Preview if you want). Redeploy after changing them.
4. `vercel.json` already sets the region to **Mumbai (`bom1`)**, close to the exchanges and the broker APIs, and a
   20-second maximum duration for API routes.
5. Open the deployment → **Settings** page in Tradyn: it shows which sources are configured and which variable
   names are still missing.

Notes:

* The build runs `instruments:sync`, which downloads Angel One's public instrument master (about 30–40 MB). If
  Vercel's build cannot reach it, the build still succeeds with the previous list.
* Everything is stateless. Caches are per-instance and short; shared state (watchlists and broker sessions) lives in
  Supabase.
* **This copy has not been deployed yet.** Run `npm run check` locally, deploy, then open Settings and a
  stock page to confirm your data source answers.

## 7. API

All replies use one envelope: `{ ok: true, data, meta? }` or `{ ok: false, error: { code, message, missing? } }`.
`meta` carries `provider`, `source`, `official`, `fetchedAt`, and `fallbackFrom` and `notice` when relevant.

| Route | Purpose |
|---|---|
| `GET /api/market/indices` | Headline indices and market status |
| `GET /api/market/movers?exchange=NSE` | Gainers, losers, most active, breadth, sectors |
| `GET /api/market/status` | NSE/BSE session from the timetable |
| `GET /api/market/list?exchange=&scope=&q=&sector=&sort=&dir=&page=&pageSize=` | Markets table page |
| `GET /api/stocks/search?q=&exchange=&limit=` | Shares and indices by symbol or name |
| `GET /api/stocks/quote?symbol=NSE:RELIANCE` | One quote |
| `GET /api/stocks/quotes?symbols=NSE:TCS,NSE:INFY` | Up to 60 quotes |
| `GET /api/stocks/history?symbol=&range=1D\|1W\|1M\|3M\|6M\|1Y\|5Y` | OHLC candles |
| `GET / POST / PUT / DELETE /api/watchlists` | Signed-in user's watchlists (RLS) |
| `GET /api/settings`, `/api/auth/*` | Configuration status (names only), sign-in / sign-up / sign-out / session |

Status codes: 400 invalid request, 401 sign-in needed, 404 unknown share, 429 rate-limited (with `Retry-After`),
502 provider error or sign-in refused, 503 not configured, 504 provider unreachable.

## 8. Testing

```bash
npm run lint && npm run typecheck && npm test      # unit tests: no network, no credentials
npm run build && npm run test:e2e                  # browser + API tests on the production build
```

* **Unit tests (Vitest, `tests/unit`)** cover:
  * Angel One, Groww and Yahoo parsing against replies in their documented formats, including sign-in, session
    expiry and re-sign-in, refused credentials, a bad TOTP secret, outages, rate limits and gaps in candles.
  * Source selection and the labelled fallback, and that no data is invented.
  * Market hours and freshness, rankings, candle clean-up, the instrument list and request validation.
  * Cache and rate limit, TOTP (RFC 6238 vectors), the simulator (formula, guardrails, determinism, events,
    experiments) and CSV formula-injection safety.
  * Boundaries: the simulator never imports market data, no `NEXT_PUBLIC_` variables, browser code never imports
    server modules, and `.env.example` holds no values.
* **Browser and API tests (`tests/e2e/run.mjs`, Playwright + Chromium)** start a local stand-in for the providers
  (`tests/e2e/mock-upstream.mjs`, synthetic replies in the documented formats, test-only) and five copies of the
  app: working source, no credentials, refused credentials, provider outage, and Yahoo fallback. They check:
  * every navigation item, search, stock pages and all seven chart ranges
  * the Markets table controls, watchlists (create, rename, add, remove, kept after reload) and the theme switch
  * the simulator: banner, runs, events, experiments, CSV export, and no price requests
  * failure messages, security headers, status codes, the rate limit and console errors
  * sideways scrolling at 360, 390, 768, 1024 and 1440 px

The original Python engine is in `python-simulator/` with its own tests (`python -m unittest discover -s tests`).

## 9. Project structure

```
src/
  app/                 pages (Overview, markets, watchlist, explorer, stocks/[key], insights, simulator, settings)
    api/               server routes: market/*, stocks/*, watchlists, settings, auth/*
  components/
    layout/ dashboard/ markets/ stocks/ watchlist/ insights/ settings/ shared/ charts/ ui/ brand/
    simulator/         simulator page (imports only src/lib/simulator)
  lib/
    providers/         angelone.ts groww.ts yahoo.ts base.ts http.ts totp.ts token-store.ts …
    market-data/       service (source selection + fallback), cache, session (market hours), universe, insights
    simulator/         engine, strategies, events, analysis, experiments, CSV (artificial market only)
    supabase/ api/ utils/
  hooks/ types/ data/
supabase/schema.sql    tables + Row Level Security
python-simulator/      the original Python engine and Experiment Lab (terminal, offline)
brand-source/          the two ORIGINAL Tradyn artworks, as uploaded
brand-kit/             high-resolution logo files made from them (dark and light backgrounds)
scripts/               build-brand.py (logos and icons), sync-instruments.mjs (NSE/BSE share list)
tests/                 unit/ (Vitest) and e2e/ (Playwright)
```

## 10. Branding and icons

Only Tradyn's own artwork is used: the **"T" emblem** (`brand-source/tradyn-emblem-original.png`) and the
**hand-drawn TRADYN wordmark** (`brand-source/tradyn-wordmark-original.png`), exactly as uploaded. Nothing is
redrawn. `python3 scripts/build-brand.py` (needs Pillow, NumPy and SciPy) makes every file from them with technical
steps only:

* lifts the artwork off its black background with clean, colour-true edges
* crops, centres and pads it
* resamples it in linear light with premultiplied alpha, so the thin neon strokes stay as bright as drawn, with
  light sharpening at small sizes
* makes the light-background version by turning only the white lettering to dark ink; green, red and purple
  stay as drawn
* puts the emblem on its dark rounded tile for icons

| Files | Use |
|---|---|
| `public/brand/tradyn-{mark,wordmark,logo}-ui.png`, `…-light-ui.png` | Shown in the app at exact size (sidebar, header, About) |
| `public/icons/icon-{16,32,48,128}.png` | Browser-extension sizes: toolbar 16/32, extensions menu and management page 48/128 |
| `public/icons/icon-{180,192,512}.png`, `icon-maskable-512.png`, `src/app/favicon.ico`, `icon.png`, `apple-icon.png` | Browser tab, installed app (Chrome "Install app", Android, iOS home screen) |
| `brand-kit/*-on-dark.png`, `*-on-light.png` | High-resolution files for slides, print and documents |

**Chrome extension:** this repository does not contain a Chrome extension; Tradyn is a web app. Chrome shows its
icons in the tab strip, in the address bar's install prompt and for the installed app, from `src/app/manifest.ts`.
If you build a companion extension, its `manifest.json` can use the same emblem files unchanged:

```json
"icons":  { "16": "icons/icon-16.png", "32": "icons/icon-32.png", "48": "icons/icon-48.png", "128": "icons/icon-128.png" },
"action": { "default_icon": { "16": "icons/icon-16.png", "32": "icons/icon-32.png" } }
```

The icons sit on their own dark tile, so they read on light and dark browser themes.

## 11. Security

* Provider and Supabase credentials are read only in server modules marked `server-only`. A test fails the build
  if browser code imports them or a `NEXT_PUBLIC_` variable appears.
* Every API input is validated with Zod. Errors shown to users never contain credentials, URLs with keys, or
  provider replies. Unexpected errors are logged by type and route only.
* Routes that change data or use the sign-in cookie accept same-origin requests only. Watchlists need a signed-in
  user and Row Level Security in PostgreSQL.
* Headers on every response: Content-Security-Policy, X-Frame-Options DENY, nosniff, Referrer-Policy,
  Permissions-Policy and HSTS. `X-Powered-By` is removed.
* No passwords or keys are hardcoded. The only key-like strings in the repository are obvious test values in
  `tests/`.

## 12. Limitations

* **Not verified against real accounts.** The Angel One, Groww and Yahoo integrations follow their published
  formats and are tested against replies in those formats, but they were not run with real credentials or live
  network access while building this. Check them after deployment (Settings and a stock page).
* **Supabase account mode was not run against a real Supabase project.** Browser-only watchlists were tested.
* **Not deployed by the build process.** Vercel compatibility comes from the design (stateless serverless routes,
  bounded requests, no long-running processes), and the production build passes locally.
* Yahoo is unofficial and may be delayed. Exchange holidays are not in the market-hours timetable; Tradyn notes
  when no prices arrive during trading hours.
* The rate limit and caches are per serverless instance (the CDN cache in front absorbs repeated requests).
* Real-time means polling, not tick streaming (see section 2).
* Rankings cover the Tradyn 100, not the whole exchange.

Market data is for research and education. Tradyn does not place orders and does not give investment advice.
