// ─────────────────────────────────────────────────────────────────────────────
// Atlas Unleashed — generic, arbitrary-ticker quote lookup.
//
// Unlike atlas-core's lib/finnhub.ts (which fetches a fixed, known ticker list),
// this looks up whatever ticker string the user typed into their own plan.
// Finnhub's quote endpoint takes any valid symbol, so this generalizes cleanly
// with no per-ticker table to maintain.
//
// Used only for the "units + live market price" tracking mode — never for
// manual-value or broker-synced users. Server-side only: the API key is never
// exposed to the client. Degrades gracefully: an unresolvable ticker (typo,
// delisted, non-US-listed — Finnhub's free tier is US-exchange-only) returns
// price: null rather than 0, so the caller can prompt for manual entry instead
// of silently showing a $0 position.
// ─────────────────────────────────────────────────────────────────────────────

const BASE = "https://finnhub.io/api/v1"
const TTL_QUOTE = 1800 // 30 min — this is portfolio tracking, not live trading

function apiKey(): string | undefined {
  return process.env.FINNHUB_API_KEY
}

export function marketDataConfigured(): boolean {
  return Boolean(apiKey())
}

export interface Quote {
  ticker: string
  price: number | null
  asOf: string
  stale: boolean
}

interface FinnhubQuote { c?: number }

/** Current price for one arbitrary ticker. `price: null` means "couldn't resolve — ask the user to enter it manually," never a guess. */
export async function getQuote(ticker: string): Promise<Quote> {
  const asOf = new Date().toISOString()
  const key = apiKey()
  if (!key) return { ticker, price: null, asOf, stale: true }

  try {
    const res = await fetch(`${BASE}/quote?symbol=${encodeURIComponent(ticker)}&token=${key}`, {
      next: { revalidate: TTL_QUOTE },
      headers: { Accept: "application/json" },
    })
    if (!res.ok) return { ticker, price: null, asOf, stale: true }
    const data = (await res.json()) as FinnhubQuote
    const price = data.c && data.c > 0 ? data.c : null
    return { ticker, price, asOf, stale: price === null }
  } catch {
    return { ticker, price: null, asOf, stale: true }
  }
}

/** Batch lookup — one quote per ticker, independently degrading on failure. */
export async function getQuotes(tickers: string[]): Promise<Record<string, Quote>> {
  const results = await Promise.all(tickers.map((t) => getQuote(t)))
  return Object.fromEntries(results.map((q) => [q.ticker, q]))
}
