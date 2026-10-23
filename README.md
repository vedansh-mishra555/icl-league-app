# ICL — IEM Cricket League

A responsive MERN application for the public league website, role-controlled live auction, multilingual Groq chatbot with a database-backed fallback, built-in scorer, and cached CricHeroes sync.

## Included

- League home, teams, players, scorecards, gallery, rules, points table, fixtures, and cap leaders
- Atomic server-validated bidding, synchronized timer, purse/squad controls, projector mode, history, analytics, CSV, and PDF receipts
- Admin, auctioneer, manager, and viewer authorization with JWT and bcrypt
- Admin CMS for teams, players, fixtures/scores, gallery, rules, auctions, users, CSV data, and CricHeroes controls
- Groq-powered English/Hindi/Hinglish answers with rate limiting, short-term caching, and regex Basic mode
- Manual/scorer/CricHeroes data-source fields, scheduled public-page caching, freshness status, and manual override support

## New in this release

- **Admin → Site & media**: drag-and-drop image uploads (stored in MongoDB, auto-resized), one-click publish to the gallery, plus editable hero text, logo, announcement banner, score strip, about/contact/social links and sponsors. Image fields in Teams, Players and Gallery forms have an Upload button.
- **AI chatbot providers**: Groq, OpenAI (or any OpenAI-compatible base URL), Google Gemini and xAI Grok. Set an env key or choose a provider, key, base URL and model in **Admin → AI chatbot** (keys are stored encrypted and never returned to the browser), with a Test connection button.
- **Live scores**: on a match, paste its CricHeroes scorecard link and switch *Live score from CricHeroes* on. The server re-reads the public scorecard every 30 seconds (score, overs, batters, bowler, this over, run rate, projected score) and the site refreshes every 30 seconds. It stops automatically once the match is completed. Manual edits to a live-synced match are overwritten while the switch is on.
- **Player stats are manual**: CricHeroes player stats are not scraped. Enter them in **Admin → Players** (matches, runs, wickets, strike rate, economy, average, highest score, 50s/100s, 4s/6s, best bowling).
- **CricHeroes**: paste a profile/match/team URL in any form and press **Test CricHeroes link** to see what is detected. Sync reads only public pages (no API key or login): player photo and playing style, team logo and points-table standings from a tournament link, and match scorecards. CricHeroes has no official API, so this depends on its page markup; manual values always win.
- Public site now runs entirely on live API data (no mock content): home, teams, players (search, role/category/price filters, sort by rating/runs/wickets), matches, gallery, rules.
- Live auction room: socket-synced timer, going once/twice, one-tap bidding, purse/squad checks, SOLD overlay, notifications, auctioneer controls and player pool, projector mode.
- Statistics, charts, team comparison, leaderboard, per-player and per-team receipts (PDF), player registration with admin approval, and optional heuristic AI (price/performance/rating prediction, squad needs, recommendations).

## Windows one-click install

1. Install [Node.js 20+](https://nodejs.org).
2. Double-click **`install-icl.bat`** — it installs packages, creates the settings files (with a random secret), and lets you choose a built-in temporary database or your own MongoDB.
3. Double-click **`run-icl.bat`** whenever you want to start ICL. The site opens at http://localhost:5173 and the admin at http://localhost:5173/admin.

## Quick start (no MongoDB install)

```powershell
npm install
npm run dev:mem
```

This runs the API on a throwaway in-memory MongoDB seeded with demo data (first run downloads a MongoDB binary). Data resets on restart.

## Quick start

Prerequisites: Node.js 20 and MongoDB 6+ (local or Atlas).

```powershell
Copy-Item server/.env.example server/.env
Copy-Item client/.env.example client/.env
npm install
npm run seed
npm run dev
```

On macOS/Linux use `cp` instead of `Copy-Item`. Set `MONGODB_URI` and a strong `JWT_SECRET` in `server/.env`; `GROQ_API_KEY` is optional. With no Groq key, chat remains available in Basic mode.

Frontend: `http://localhost:5173`  
API/Socket.io: `http://localhost:4000`
Admin CMS: `http://localhost:5173/admin` (admin role required)

Seeded accounts all use the local-demo password `ChangeMe123!`:

| Role | Email |
|---|---|
| Admin | `admin@icl.test` |
| Auctioneer | `auctioneer@icl.test` |
| Team manager | `manager@icl.test` |

Change these credentials before a shared or public deployment.

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Start the API and Vite client together |
| `npm run build` | Create the production client bundle |
| `npm start` | Start the API service |
| `npm run seed` | Idempotently load demo league/users and recreate demo fixtures |

## Architecture

```text
React/Vite/Tailwind/Recharts
        | REST + Socket.io
Express API ── JWT/RBAC ── MongoDB Atlas
    |          |              |
 Groq      Auction engine   Source adapters
 fallback  atomic bids      manual/scorer/CricHeroes cron
```

Manual fields are stored separately from synced fields and are merged with manual values taking precedence. CricHeroes runs only from the scheduled worker/admin sync endpoint; user requests always read cached MongoDB data.

More detail:

- [API and Socket.io contract](docs/API.md)
- [Architecture and trust boundaries](docs/ARCHITECTURE.md)
- [Deployment guide](docs/DEPLOYMENT.md)
- [Acceptance checklist](docs/ACCEPTANCE_CHECKLIST.md)

## Deployment

- Deploy `client` on Vercel with `VITE_API_URL` and `VITE_SOCKET_URL` pointing to Render.
- Deploy the repository on Render using the included `render.yaml` and configure the variables in `server/.env.example`.
- Use MongoDB Atlas for `MONGODB_URI`. Run a single backend instance.
