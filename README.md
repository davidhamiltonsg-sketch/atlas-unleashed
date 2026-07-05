# Atlas Unleashed

Build your own investment plan — funds, target weights, tolerance bands, caps —
and let this app hold you to it. It never recommends what to buy, what weights
to pick, or what thresholds to use, and it never places a trade. Its only job
is to check your portfolio against the rules you set for yourself.

## What's here (v1)

- Self-serve onboarding wizard: account → investment horizon (a timeframe, not
  a "purpose") → funds → starting point → guardrails → review
- One generic compliance engine (`lib/engine.ts`) driving every user's plan —
  a fixed priority ladder (hard cap → combined ceiling → floor → drawdown →
  underweight drift → standard split), parameterized entirely by what the user
  typed in
- Three ways to keep a fund's value current: manual entry, units held + a live
  market-price lookup (Finnhub), or a read-only broker connection (not yet
  built — see below)
- A dashboard: this month's compliance-framed recommendation, a health
  scorecard, and an editable holdings table
- A read-only "Your plan" summary page — a templated view of what you built,
  not hand-authored prose

## Not yet built (fast-follows)

- **Read-only IBKR broker sync.** The `BrokerConnection` schema model exists,
  but the sync logic/UI don't yet — see the plan below for exactly what's
  scoped. No broker order/trade-placement code exists anywhere in this repo.
- Look-through/hidden-exposure analysis for arbitrary tickers
- Phase/milestone goal mechanics
- Brokers beyond IBKR

## Local setup

```bash
npm install
cp .env.example .env   # then fill in DATABASE_URL, SESSION_SECRET, (optional) FINNHUB_API_KEY
npx prisma generate
npx prisma db push
npm run dev
```

Open [http://localhost:3000/signup](http://localhost:3000/signup) to build a plan.

## Verification

```bash
npm run check   # generic-engine contract test (scripts/check-engine.ts)
npm run lint
npm run build
```

## Stack

Next.js 16 (App Router) · React 19 · Prisma 7 + SQLite (`@libsql/client`) ·
Tailwind 4 · `bcryptjs` · `jose` (JWT sessions) · `lucide-react`.

Mirrors the proven stack of a sibling project (`atlas-core`), adapted here for
a single, user-authored portfolio rather than a fixed hardcoded one.
