/**
 * Atlas Unleashed — generic compliance engine contract check.
 *
 * Unlike atlas-core's per-portfolio checks (which pin known ticker/threshold
 * constants), there are no hardcoded numbers to pin here — every user authors
 * their own. Instead this exercises the FIXED priority ladder itself against a
 * synthetic 3-fund test portfolio, covering every branch, its boundaries, and
 * every priority tie, so the ladder's ordering can never silently drift.
 *
 * Run: npx tsx scripts/check-engine.ts  (or: npm run check:engine)
 * Exit: 0 = all aligned · 1 = one or more mismatches (prints each).
 */
import { route, computeNextMove, computeDcaSplit, type FundPosition, type EngineOptions } from "../lib/engine"

let failures = 0
let passes = 0
function eq(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a !== e) { console.error(`  ✗  ${label}\n       expected: ${e}\n       got:      ${a}`); failures++ }
  else { console.log(`  ✓  ${label}`); passes++ }
}

console.log("Atlas Unleashed — generic engine contract check\n")

// ── Synthetic test portfolio ──────────────────────────────────────────────────
// AAA: the broadest/core fund (highest target weight, no cap/floor).
// BBB: has a hard cap.
// CCC: has a floor.
const TOTAL = 10_000

function fp(ticker: string, actualPct: number, overrides: Partial<FundPosition> = {}): FundPosition {
  const base: Record<string, FundPosition> = {
    AAA: { ticker: "AAA", name: "Fund A", color: "#000", value: 0, actualPct: 0, targetPct: 50, rangeLow: 45, rangeHigh: 55, hardCap: null, floor: null },
    BBB: { ticker: "BBB", name: "Fund B", color: "#000", value: 0, actualPct: 0, targetPct: 30, rangeLow: 25, rangeHigh: 35, hardCap: 40, floor: null },
    CCC: { ticker: "CCC", name: "Fund C", color: "#000", value: 0, actualPct: 0, targetPct: 20, rangeLow: 15, rangeHigh: 25, hardCap: null, floor: 10 },
  }
  return { ...base[ticker], actualPct, value: (actualPct / 100) * TOTAL, ...overrides }
}

function primary(positions: FundPosition[], monthly: number, opts: EngineOptions = {}): string {
  const plan = computeDcaSplit(positions, monthly, opts)
  return plan.allocations.reduce((best, a) => (a.amount > (best?.amount ?? -1) ? a : best), null as { ticker: string; amount: number } | null)?.ticker ?? "?"
}
function nm(positions: FundPosition[], opts: EngineOptions = {}) {
  return computeNextMove(positions, TOTAL, opts)
}
function agree(label: string, positions: FundPosition[], opts: EngineOptions, expectedTicker: string, severity: string) {
  const h = nm(positions, opts)
  eq(`${label} — headline ${expectedTicker}/${severity}`, [h.ticker, h.severity], [expectedTicker, severity])
  eq(`${label} — split → ${expectedTicker}`, primary(positions, 1000, opts), expectedTicker)
}

// ---- Every branch, isolated so only the tested branch fires ----
console.log("Every ladder branch")

eq("empty portfolio → none", [route([], 0).tag, computeNextMove([], 0).severity], ["empty", "none"])

// 1 — hard-cap breach (BBB > 40%). Asymmetric by design (same pattern as atlas-core's SBR
// engine): the headline NAMES the offending fund (BBB, for the user's awareness) while the
// split redirects new money AWAY from it (to AAA) — never buying more of an over-cap fund.
{
  const p = [fp("AAA", 35), fp("BBB", 45), fp("CCC", 20)]
  eq("hard cap (BBB 45%) — headline names BBB/critical", [nm(p).ticker, nm(p).severity], ["BBB", "critical"])
  eq("hard cap (BBB 45%) — split redirects to AAA, never BBB", primary(p, 1000), "AAA")
}

// 2 — combined-ceiling breach (BBB+CCC > 55, neither individually over its own cap/floor)
agree("combined ceiling (BBB+CCC=60)", [fp("AAA", 40), fp("BBB", 35), fp("CCC", 25)], { combinedGroup: { tickers: ["BBB", "CCC"], hard: 55 } }, "AAA", "high")

// 3 — floor breach (CCC < 10)
agree("floor (CCC 5%)", [fp("AAA", 55), fp("BBB", 40), fp("CCC", 5)], {}, "CCC", "high")

// 4 — drawdown trigger (nothing higher-priority firing)
agree("drawdown -20% (trigger 15%)", [fp("AAA", 50), fp("BBB", 30), fp("CCC", 20)], { drawdownTriggerPct: 15, portfolioDrawdownPct: -20 }, "AAA", "high")

// 5 — underweight drift (CCC below its range, nothing higher-priority firing)
agree("underweight (CCC 12%)", [fp("AAA", 48), fp("BBB", 40), fp("CCC", 12)], {}, "CCC", "medium")

// 6 — standard: everything on target
{
  const p = [fp("AAA", 50), fp("BBB", 30), fp("CCC", 20)]
  eq("standard — headline none", nm(p).severity, "none")
  eq("standard — split largest is AAA (highest target weight)", primary(p, 1000), "AAA")
}

// ---- Boundary conditions: the > / < / <= edges ----
// Each of these also has AAA below its own rangeLow (45), so at the hard-cap/
// floor boundary itself the NEXT-priority branch (underweight) is expected to
// fire instead of standard — that's the correct behavior, not a bug: sitting
// exactly at a cap/floor doesn't mean the rest of the portfolio is in range.
console.log("\nBoundaries")
eq("hard cap == 40 → not the hard-cap branch (strict >)", route([fp("AAA", 35), fp("BBB", 40), fp("CCC", 25)], TOTAL).tag, "underweight")
eq("floor == 10 → not the floor branch (strict <)", route([fp("AAA", 55), fp("BBB", 35), fp("CCC", 10)], TOTAL).tag, "underweight")
eq("combined == 55 → not a breach (strict >)", route([fp("AAA", 45), fp("BBB", 33), fp("CCC", 22)], TOTAL, { combinedGroup: { tickers: ["BBB", "CCC"], hard: 55 } }).tag, "standard")
agree("drawdown == trigger (-15 == 15) → fires (inclusive <=)", [fp("AAA", 50), fp("BBB", 30), fp("CCC", 20)], { drawdownTriggerPct: 15, portfolioDrawdownPct: -15 }, "AAA", "high")

// ---- Priority ties: the SAME higher rule wins in both headline and split ----
console.log("\nPriority order")
// Hard cap beats combined ceiling (BBB alone over cap, and BBB+CCC also over a looser combined limit)
{
  const p = [fp("AAA", 20), fp("BBB", 45), fp("CCC", 35)]
  const opts: EngineOptions = { combinedGroup: { tickers: ["BBB", "CCC"], hard: 55 } }
  eq("hard cap beats combined — headline names BBB/critical", [nm(p, opts).ticker, nm(p, opts).severity], ["BBB", "critical"])
  eq("hard cap beats combined — split redirects to AAA", primary(p, 1000, opts), "AAA")
}
// Combined beats floor (BBB+CCC over a 45 combined limit, CCC also below its own floor)
agree("combined beats floor", [fp("AAA", 54), fp("BBB", 38), fp("CCC", 8)], { combinedGroup: { tickers: ["BBB", "CCC"], hard: 45 } }, "AAA", "high")
// Floor beats drawdown (CCC below floor, drawdown trigger also met)
agree("floor beats drawdown", [fp("AAA", 58), fp("BBB", 34), fp("CCC", 8)], { drawdownTriggerPct: 15, portfolioDrawdownPct: -20 }, "CCC", "high")
// Drawdown beats underweight (CCC below range, drawdown trigger also met)
agree("drawdown beats underweight", [fp("AAA", 50), fp("BBB", 38), fp("CCC", 12)], { drawdownTriggerPct: 15, portfolioDrawdownPct: -20 }, "AAA", "high")

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${"─".repeat(54)}`)
if (failures === 0) { console.log(`  All ${passes} checks passed. Generic engine ✓`); process.exit(0) }
else { console.error(`  ${failures} check(s) failed, ${passes} passed.`); process.exit(1) }
