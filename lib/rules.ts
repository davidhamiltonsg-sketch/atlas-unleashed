// ─────────────────────────────────────────────────────────────────────────────
// Atlas Unleashed — Rules tab checklist.
//
// One check per rule the user actually set — plain-English, always citing the
// user's own number, never advice. Reuses the exact predicates lib/engine.ts's
// route() uses (isOverHardCap/isUnderFloor/isOutOfRange/combinedGroupTotal) so
// this checklist can never disagree with what the engine actually enforces.
// ─────────────────────────────────────────────────────────────────────────────

import { isOverHardCap, isUnderFloor, isOutOfRange, combinedGroupTotal, type FundPosition, type CombinedGroup } from "@/lib/engine"

export type RuleStatus = "ok" | "watch" | "breach"

export interface RuleCheck {
  id: string
  scope: "fund" | "portfolio"
  label: string
  status: RuleStatus
  detail: string
}

export interface RulesResult {
  checks: RuleCheck[]
  breaches: number
  watches: number
  overall: RuleStatus
}

const WATCH_MARGIN = 0.9 // "watch" once a fund is within 10% of tripping a hard rule

export function evaluateRules(
  positions: FundPosition[],
  opts: { combinedGroup?: CombinedGroup | null; drawdownTriggerPct?: number | null; portfolioDrawdownPct?: number | null } = {}
): RulesResult {
  const checks: RuleCheck[] = []

  for (const p of positions) {
    if (p.hardCap !== null) {
      const breach = isOverHardCap(p)
      const watch = !breach && p.actualPct > p.hardCap * WATCH_MARGIN
      checks.push({
        id: `${p.ticker}-cap`, scope: "fund", label: `Your rule: ${p.ticker} stays under ${p.hardCap}%`,
        status: breach ? "breach" : watch ? "watch" : "ok",
        detail: `Currently ${p.actualPct.toFixed(1)}%.`,
      })
    }
    if (p.floor !== null) {
      const breach = isUnderFloor(p)
      const watch = !breach && p.actualPct < p.floor * (2 - WATCH_MARGIN)
      checks.push({
        id: `${p.ticker}-floor`, scope: "fund", label: `Your rule: ${p.ticker} stays above ${p.floor}%`,
        status: breach ? "breach" : watch ? "watch" : "ok",
        detail: `Currently ${p.actualPct.toFixed(1)}%.`,
      })
    }
    const outOfRange = isOutOfRange(p)
    checks.push({
      id: `${p.ticker}-range`, scope: "fund", label: `Your rule: ${p.ticker} stays within ${p.rangeLow}%–${p.rangeHigh}%`,
      status: outOfRange ? "watch" : "ok",
      detail: `Currently ${p.actualPct.toFixed(1)}% (target ${p.targetPct}%).`,
    })
  }

  if (opts.combinedGroup) {
    const combined = combinedGroupTotal(positions, opts.combinedGroup)
    const breach = combined > opts.combinedGroup.hard
    const watch = !breach && combined > opts.combinedGroup.hard * WATCH_MARGIN
    checks.push({
      id: "combined", scope: "portfolio", label: `Your rule: ${opts.combinedGroup.tickers.join(" + ")} stay under ${opts.combinedGroup.hard}% combined`,
      status: breach ? "breach" : watch ? "watch" : "ok",
      detail: `Currently ${combined.toFixed(1)}% combined.`,
    })
  }

  if (opts.drawdownTriggerPct != null) {
    const dd = opts.portfolioDrawdownPct ?? 0
    const fired = dd <= -opts.drawdownTriggerPct
    checks.push({
      id: "drawdown", scope: "portfolio", label: `Your rule: redirect new money on a ${opts.drawdownTriggerPct}% drawdown`,
      status: fired ? "watch" : "ok",
      detail: fired ? `Portfolio is down ${Math.abs(dd).toFixed(0)}% from its peak — this rule is active.` : `Portfolio drawdown from peak: ${dd ? Math.abs(dd).toFixed(0) + "%" : "0%"}.`,
    })
  }

  const breaches = checks.filter((c) => c.status === "breach").length
  const watches = checks.filter((c) => c.status === "watch").length
  return { checks, breaches, watches, overall: breaches > 0 ? "breach" : watches > 0 ? "watch" : "ok" }
}
