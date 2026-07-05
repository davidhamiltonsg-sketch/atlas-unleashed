// ─────────────────────────────────────────────────────────────────────────────
// Atlas Unleashed — Risk tab calculations.
//
// Position-level concentration (HHI/effective-N) needs nothing beyond the
// weights already in a FundPosition[] — computable for ANY user's arbitrary
// ticker set, unlike per-fund company look-through (see lib/look-through.ts,
// which needs an external knowledge source and is a separate, clearly-labeled
// AI estimate). Volatility is computed from the portfolio's own recorded value
// history — no external data needed either, but it needs enough history to
// mean anything.
// ─────────────────────────────────────────────────────────────────────────────

import type { FundPosition } from "@/lib/engine"
import type { TimelinePoint } from "@/lib/portfolio-data"

export interface ConcentrationResult {
  hhiPct: number // 0-100, sum of squared weights (as percentages)
  effectiveN: number // 1 / HHI (as a fraction) — "behaves like N equal-sized positions"
  topPosition: FundPosition | null
  rating: "Diversified" | "Moderate" | "Concentrated"
}

export function computeConcentration(positions: FundPosition[]): ConcentrationResult {
  if (positions.length === 0) {
    return { hhiPct: 0, effectiveN: 0, topPosition: null, rating: "Diversified" }
  }
  const hhiFraction = positions.reduce((sum, p) => sum + Math.pow(p.actualPct / 100, 2), 0)
  const hhiPct = hhiFraction * 100
  const effectiveN = hhiFraction > 0 ? 1 / hhiFraction : 0
  const topPosition = [...positions].sort((a, b) => b.actualPct - a.actualPct)[0]
  const rating: ConcentrationResult["rating"] = hhiPct < 10 ? "Diversified" : hhiPct < 18 ? "Moderate" : "Concentrated"
  return { hhiPct, effectiveN, topPosition, rating }
}

export interface VolatilityResult {
  stdevPct: number // stdev of period-over-period % changes
  sampleSize: number
}

/** Null when fewer than 3 snapshots exist — a stdev over 1-2 points is meaningless, not just imprecise. */
export function computeVolatility(timeline: TimelinePoint[]): VolatilityResult | null {
  if (timeline.length < 3) return null
  const returns: number[] = []
  for (let i = 1; i < timeline.length; i++) {
    const prev = timeline[i - 1].value
    if (prev > 0) returns.push(((timeline[i].value - prev) / prev) * 100)
  }
  if (returns.length < 2) return null
  const mean = returns.reduce((s, r) => s + r, 0) / returns.length
  const variance = returns.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / returns.length
  return { stdevPct: Math.sqrt(variance), sampleSize: returns.length }
}
