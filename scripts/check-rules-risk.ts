/**
 * Atlas Unleashed — Rules tab (evaluateRules) and Risk tab (computeConcentration/
 * computeVolatility) contract check.
 *
 * Same synthetic 3-fund test portfolio as scripts/check-engine.ts (AAA/BBB/CCC),
 * so the boundary values already pinned there stay consistent with what the
 * Rules tab reports for the same inputs.
 *
 * Run: npx tsx scripts/check-rules-risk.ts  (or: npm run check:rules-risk)
 * Exit: 0 = all aligned · 1 = one or more mismatches (prints each).
 */
import { evaluateRules } from "../lib/rules"
import { computeConcentration, computeVolatility } from "../lib/risk"
import type { FundPosition } from "../lib/engine"
import type { TimelinePoint } from "../lib/portfolio-data"

let failures = 0
let passes = 0
function eq(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a !== e) { console.error(`  ✗  ${label}\n       expected: ${e}\n       got:      ${a}`); failures++ }
  else { console.log(`  ✓  ${label}`); passes++ }
}

console.log("Atlas Unleashed — Rules + Risk contract check\n")

const TOTAL = 10_000
function fp(ticker: string, actualPct: number, overrides: Partial<FundPosition> = {}): FundPosition {
  const base: Record<string, FundPosition> = {
    AAA: { ticker: "AAA", name: "Fund A", color: "#000", value: 0, actualPct: 0, targetPct: 50, rangeLow: 45, rangeHigh: 55, hardCap: null, floor: null },
    BBB: { ticker: "BBB", name: "Fund B", color: "#000", value: 0, actualPct: 0, targetPct: 30, rangeLow: 25, rangeHigh: 35, hardCap: 40, floor: null },
    CCC: { ticker: "CCC", name: "Fund C", color: "#000", value: 0, actualPct: 0, targetPct: 20, rangeLow: 15, rangeHigh: 25, hardCap: null, floor: 10 },
  }
  return { ...base[ticker], actualPct, value: (actualPct / 100) * TOTAL, ...overrides }
}

// ── evaluateRules ─────────────────────────────────────────────────────────────
console.log("evaluateRules")

// Standard portfolio: every check passes.
{
  const p = [fp("AAA", 50), fp("BBB", 30), fp("CCC", 20)]
  const r = evaluateRules(p)
  eq("standard — overall ok", r.overall, "ok")
  eq("standard — no breaches", r.breaches, 0)
}

// Hard-cap breach on BBB (>40) → breach; nothing else affected.
{
  const p = [fp("AAA", 35), fp("BBB", 45), fp("CCC", 20)]
  const r = evaluateRules(p)
  const capCheck = r.checks.find((c) => c.id === "BBB-cap")!
  eq("BBB over cap → breach", capCheck.status, "breach")
  eq("overall breach", r.overall, "breach")
}

// Watch band: BBB at 37% is within 10% of its 40% cap (37 > 40*0.9=36) → watch, not breach.
{
  const p = [fp("AAA", 43), fp("BBB", 37), fp("CCC", 20)]
  const r = evaluateRules(p)
  const capCheck = r.checks.find((c) => c.id === "BBB-cap")!
  eq("BBB at 37% (cap 40) → watch", capCheck.status, "watch")
}

// Floor breach on CCC (<10) → breach.
{
  const p = [fp("AAA", 55), fp("BBB", 40), fp("CCC", 5)]
  const r = evaluateRules(p)
  const floorCheck = r.checks.find((c) => c.id === "CCC-floor")!
  eq("CCC under floor → breach", floorCheck.status, "breach")
}

// Range check: AAA below its range (45) → watch on the range check specifically.
{
  const p = [fp("AAA", 40), fp("BBB", 40), fp("CCC", 20)]
  const r = evaluateRules(p)
  const rangeCheck = r.checks.find((c) => c.id === "AAA-range")!
  eq("AAA below range → watch", rangeCheck.status, "watch")
}

// Combined-group breach.
{
  const p = [fp("AAA", 40), fp("BBB", 35), fp("CCC", 25)]
  const r = evaluateRules(p, { combinedGroup: { tickers: ["BBB", "CCC"], hard: 55 } })
  const combinedCheck = r.checks.find((c) => c.id === "combined")!
  eq("BBB+CCC=60 over 55 → breach", combinedCheck.status, "breach")
}

// Drawdown trigger check reports "watch" (informational — a portfolio condition, not a
// fund breaking a user rule) when it fires, "ok" otherwise.
{
  const p = [fp("AAA", 50), fp("BBB", 30), fp("CCC", 20)]
  const fired = evaluateRules(p, { drawdownTriggerPct: 15, portfolioDrawdownPct: -20 })
  const notFired = evaluateRules(p, { drawdownTriggerPct: 15, portfolioDrawdownPct: -5 })
  eq("drawdown fired → watch", fired.checks.find((c) => c.id === "drawdown")!.status, "watch")
  eq("drawdown not fired → ok", notFired.checks.find((c) => c.id === "drawdown")!.status, "ok")
}

// No hard caps/floors/combined/drawdown at all → checks list has only range checks, all ok.
{
  const p = [{ ...fp("AAA", 50), hardCap: null, floor: null }, { ...fp("BBB", 30), hardCap: null, floor: null }, { ...fp("CCC", 20), hardCap: null, floor: null }]
  const r = evaluateRules(p)
  eq("no hard limits — 3 range-only checks", r.checks.length, 3)
  eq("no hard limits — all ok", r.overall, "ok")
}

// ── computeConcentration ──────────────────────────────────────────────────────
console.log("\ncomputeConcentration")

// Even 3-way split: HHI = 3 × (33.33)² / 100 ≈ 33.3, effectiveN ≈ 3.
{
  const p = [fp("AAA", 33.33), fp("BBB", 33.33), fp("CCC", 33.34)]
  const c = computeConcentration(p)
  eq("even split — effectiveN ≈ 3", Math.round(c.effectiveN), 3)
  eq("even split — rated Concentrated (HHI still 33%, correct per the 10/18 bands)", c.rating, "Concentrated")
}

// Hand-computed HHI for the standard 50/30/20 split: 0.5² + 0.3² + 0.2² = 0.38 → 38%.
{
  const p = [fp("AAA", 50), fp("BBB", 30), fp("CCC", 20)]
  const c = computeConcentration(p)
  eq("50/30/20 — HHI = 38.0", Math.round(c.hhiPct * 10) / 10, 38)
  eq("50/30/20 — top position is AAA", c.topPosition?.ticker, "AAA")
}

// A single-position portfolio is maximally concentrated: HHI = 100, effectiveN = 1.
{
  const c = computeConcentration([fp("AAA", 100)])
  eq("single position — HHI = 100", c.hhiPct, 100)
  eq("single position — effectiveN = 1", c.effectiveN, 1)
  eq("single position — rated Concentrated", c.rating, "Concentrated")
}

// A very even 10-way split is Diversified (HHI = 10 × (10)² / 100 = 10 — right at the boundary,
// which computeConcentration treats as NOT diversified since the check is strict <10).
{
  const p = Array.from({ length: 10 }, (_, i) => fp("AAA", 10, { ticker: `T${i}`, targetPct: 10, rangeLow: 5, rangeHigh: 15 }))
  const c = computeConcentration(p)
  eq("10-way even split — HHI = 10 (boundary, not Diversified)", c.rating, "Moderate")
}

// ── computeVolatility ──────────────────────────────────────────────────────────
console.log("\ncomputeVolatility")

eq("empty timeline → null", computeVolatility([]), null)
eq("1 point → null", computeVolatility([{ date: "2026-01-01", value: 1000 }]), null)
eq("2 points → null (need >=3)", computeVolatility([{ date: "2026-01-01", value: 1000 }, { date: "2026-02-01", value: 1100 }]), null)

{
  // Three flat values → zero volatility.
  const flat: TimelinePoint[] = [{ date: "2026-01-01", value: 1000 }, { date: "2026-02-01", value: 1000 }, { date: "2026-03-01", value: 1000 }]
  const v = computeVolatility(flat)
  eq("flat values → stdev 0", v?.stdevPct, 0)
  eq("flat values → sampleSize 2", v?.sampleSize, 2)
}

{
  // +10%, -10% swings around 1000 → non-zero stdev.
  const swings: TimelinePoint[] = [{ date: "2026-01-01", value: 1000 }, { date: "2026-02-01", value: 1100 }, { date: "2026-03-01", value: 990 }]
  const v = computeVolatility(swings)
  eq("swinging values → stdev > 0", (v?.stdevPct ?? 0) > 0, true)
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${"─".repeat(54)}`)
if (failures === 0) { console.log(`  All ${passes} checks passed. Rules + Risk ✓`); process.exit(0) }
else { console.error(`  ${failures} check(s) failed, ${passes} passed.`); process.exit(1) }
