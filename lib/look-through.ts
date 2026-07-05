// ─────────────────────────────────────────────────────────────────────────────
// Atlas Unleashed — AI-estimated fund look-through.
//
// atlas-core has a hand-maintained fact-sheet table for its fixed 5-8 tickers.
// Here a user can type ANY ticker, so there's no such table to maintain. Instead,
// Claude is asked what it knows about a ticker's sector and top constituent
// holdings — a best-effort estimate from training knowledge, not verified fund
// data. Every surface that shows this MUST disclose it as an estimate and point
// the user back to the fund's own fact sheet — never presented as fact.
//
// Cached in the FundLookThrough table (never called on every page load) and
// only ever refreshed on explicit user action, same "as-of" staleness pattern
// used throughout atlas-core's own look-through disclosures.
// ─────────────────────────────────────────────────────────────────────────────

import Anthropic from "@anthropic-ai/sdk"
import { db } from "@/lib/db"

export interface FundHolding {
  name: string
  pct: number
}

export interface LookThroughResult {
  ticker: string
  sector: string
  topHoldings: FundHolding[]
  confidence: "high" | "medium" | "low"
  note: string
  updatedAt: Date
}

export function lookThroughConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY)
}

export async function getCachedLookThrough(ticker: string): Promise<LookThroughResult | null> {
  const row = await db.fundLookThrough.findUnique({ where: { ticker: ticker.toUpperCase() } })
  if (!row) return null
  return {
    ticker: row.ticker, sector: row.sector, confidence: row.confidence as LookThroughResult["confidence"],
    note: row.note, updatedAt: row.updatedAt, topHoldings: JSON.parse(row.topHoldings) as FundHolding[],
  }
}

/** True when the cached estimate is older than 180 days — fund composition drifts slowly, but not never. */
export function isStale(updatedAt: Date, staleAfterDays = 180): boolean {
  return Math.floor((Date.now() - updatedAt.getTime()) / 86_400_000) > staleAfterDays
}

const PROMPT = (ticker: string) => `For the fund, ETF, or stock with ticker symbol "${ticker}", provide your best knowledge of:
1. Its dominant sector or category, in a few words (e.g. "US large-cap technology", "Global bonds", "Single company — semiconductors").
2. Its approximate top 5 holdings with rough percentage weight. If it's a single stock, return one entry: that company at 100%.

Respond with ONLY a JSON object, no other text, in exactly this shape:
{"sector": string, "topHoldings": [{"name": string, "pct": number}], "confidence": "high"|"medium"|"low", "note": string}

"note" should be one short sentence caveating that these are approximate and may be outdated. If you don't recognize this ticker at all, respond with:
{"sector": "Unknown", "topHoldings": [], "confidence": "low", "note": "This ticker wasn't recognized — double check it's correct."}`

export type RefreshResult = { success: true } | { success: false; error: string }

export async function refreshLookThrough(ticker: string): Promise<RefreshResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return { success: false, error: "AI look-through isn't configured on this server." }

  const t = ticker.trim().toUpperCase()
  if (!t) return { success: false, error: "No ticker given." }

  try {
    const client = new Anthropic({ apiKey })
    const message = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 1024,
      messages: [{ role: "user", content: PROMPT(t) }],
    })
    const text = message.content[0]?.type === "text" ? message.content[0].text : ""
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return { success: false, error: "Claude didn't return a parseable result." }

    const parsed = JSON.parse(jsonMatch[0]) as {
      sector: string
      topHoldings: FundHolding[]
      confidence: string
      note: string
    }
    const confidence = ["high", "medium", "low"].includes(parsed.confidence) ? parsed.confidence : "low"

    await db.fundLookThrough.upsert({
      where: { ticker: t },
      create: { ticker: t, sector: parsed.sector, topHoldings: JSON.stringify(parsed.topHoldings ?? []), confidence, note: parsed.note },
      update: { sector: parsed.sector, topHoldings: JSON.stringify(parsed.topHoldings ?? []), confidence, note: parsed.note },
    })
    return { success: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    return { success: false, error: `Couldn't reach Claude: ${msg}` }
  }
}

/**
 * Blend each held fund's AI-estimated composition by its portfolio weight into
 * one aggregated company list — same weighted-sum shape as atlas-core's
 * computeLookThrough, generic here since it takes whatever tickers/weights the
 * caller has cached data for. Funds with no cached estimate simply contribute
 * nothing (never a guessed number) — the caller shows which funds are missing.
 */
export function aggregateCompanies(
  positions: Array<{ ticker: string; actualPct: number }>,
  lookThroughByTicker: Record<string, LookThroughResult>
): FundHolding[] {
  const totals: Record<string, number> = {}
  for (const p of positions) {
    const lt = lookThroughByTicker[p.ticker.toUpperCase()]
    if (!lt) continue
    const w = p.actualPct / 100
    for (const h of lt.topHoldings) {
      totals[h.name] = (totals[h.name] ?? 0) + w * h.pct
    }
  }
  return Object.entries(totals).map(([name, pct]) => ({ name, pct })).sort((a, b) => b.pct - a.pct)
}
