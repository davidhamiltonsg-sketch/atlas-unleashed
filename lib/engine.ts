// ─────────────────────────────────────────────────────────────────────────────
// Atlas Unleashed — the ONE generic compliance engine.
//
// Unlike atlas-core (which hand-codes a separate engine per hardcoded portfolio),
// every user here authors their own funds/targets/guardrails through the
// onboarding wizard, so there is exactly one engine, parameterized entirely by
// what the user typed in. It never suggests funds, weights, or thresholds — it
// only checks the user's OWN portfolio against the user's OWN rules.
//
// Compliance framing, not advice framing: every headline below is phrased as
// "your rule says X", never "we recommend X". This engine also never places a
// trade — it only ever produces a read-only recommendation for the user to act
// on themselves (or not).
//
// Modeled on atlas-core's lib/sbr-engine.ts `sbrRoute()` pattern: one route()
// function returns a single tagged branch; both the headline text and the money
// split are derived from that same branch, so they can never disagree.
//
// Fixed priority ladder (deliberately not user-configurable — see the plan
// rationale: arbitrary user-ordered rule logic is a correctness/testing dead
// end, so the ladder itself is fixed and only the NUMBERS are user-authored):
//   1. Hard-cap breach       → flag it, redirect new money elsewhere
//   2. Combined-ceiling breach (if the user defined one group) → redirect
//   3. Floor breach          → build that fund first
//   4. Drawdown trigger (if set) → redirect to the broadest fund
//   5. Underweight drift     → fill the biggest below-range fund
//   6. Standard proportional split at target weights
// ─────────────────────────────────────────────────────────────────────────────

export interface FundPosition {
  ticker: string
  name: string
  color: string
  value: number
  actualPct: number
  targetPct: number
  rangeLow: number
  rangeHigh: number
  hardCap: number | null
  floor: number | null
}

export interface CombinedGroup {
  tickers: string[]
  hard: number
}

export interface EngineOptions {
  combinedGroup?: CombinedGroup | null
  drawdownTriggerPct?: number | null
  /** Portfolio drawdown from its recent peak, negative %, e.g. -18. */
  portfolioDrawdownPct?: number | null
}

export type EngineBranch =
  | { tag: "empty" }
  | { tag: "hard_cap"; fund: FundPosition }
  | { tag: "combined_hard"; tickers: string[]; combined: number; hard: number }
  | { tag: "floor"; fund: FundPosition }
  | { tag: "drawdown"; drawdownPct: number }
  | { tag: "underweight"; fund: FundPosition }
  | { tag: "standard" }

export type Severity = "none" | "low" | "medium" | "high" | "critical"

export interface NextMove {
  severity: Severity
  ticker: string | null
  action: string
  what: string
  why: string
  when: string
  color: string
}

export interface DcaAllocation {
  ticker: string
  name: string
  color: string
  amount: number
  standardAmount: number
  tag: "standard" | "boosted" | "zeroed"
  reason: string
}

export interface DcaPlan {
  allocations: DcaAllocation[]
  headline: string
  overlayNote: string | null
}

// The fund the user has weighted heaviest in their own plan — used as the
// generic "redirect new money here" target. Not a recommendation of what to
// buy; it's simply the fund the user's own target weights already favor most.
function broadestFund(positions: FundPosition[], exclude: string[] = []): FundPosition | undefined {
  return [...positions]
    .filter((p) => !exclude.includes(p.ticker))
    .sort((a, b) => b.targetPct - a.targetPct)[0]
}

// ─── Shared breach predicates ────────────────────────────────────────────────
// Exported so lib/rules.ts's rule-by-rule checklist tests the EXACT same
// thresholds route() uses — never a second, slightly different copy.
export function isOverHardCap(p: FundPosition): boolean {
  return p.hardCap !== null && p.actualPct > p.hardCap
}
export function isUnderFloor(p: FundPosition): boolean {
  return p.floor !== null && p.actualPct < p.floor
}
export function isOutOfRange(p: FundPosition): boolean {
  return p.actualPct < p.rangeLow || p.actualPct > p.rangeHigh
}
export function combinedGroupTotal(positions: FundPosition[], group: CombinedGroup): number {
  return positions.filter((p) => group.tickers.includes(p.ticker)).reduce((s, p) => s + p.actualPct, 0)
}

export function route(positions: FundPosition[], totalValue: number, opts: EngineOptions = {}): EngineBranch {
  if (totalValue <= 0 || positions.length === 0) return { tag: "empty" }

  // 1 — hard-cap breach (the fund furthest over its own cap fires first)
  const overCap = positions
    .filter((p) => p.hardCap !== null && p.actualPct > p.hardCap)
    .sort((a, b) => (b.actualPct - b.hardCap!) - (a.actualPct - a.hardCap!))
  if (overCap.length > 0) return { tag: "hard_cap", fund: overCap[0] }

  // 2 — combined-ceiling breach (only if the user defined one group)
  if (opts.combinedGroup) {
    const combined = positions
      .filter((p) => opts.combinedGroup!.tickers.includes(p.ticker))
      .reduce((s, p) => s + p.actualPct, 0)
    if (combined > opts.combinedGroup.hard) {
      return { tag: "combined_hard", tickers: opts.combinedGroup.tickers, combined, hard: opts.combinedGroup.hard }
    }
  }

  // 3 — floor breach (the fund furthest below its own floor fires first)
  const underFloor = positions
    .filter((p) => p.floor !== null && p.actualPct < p.floor)
    .sort((a, b) => (b.floor! - b.actualPct) - (a.floor! - a.actualPct))
  if (underFloor.length > 0) return { tag: "floor", fund: underFloor[0] }

  // 4 — drawdown trigger (only if the user set one)
  if (
    opts.drawdownTriggerPct != null &&
    opts.portfolioDrawdownPct != null &&
    opts.portfolioDrawdownPct <= -opts.drawdownTriggerPct
  ) {
    return { tag: "drawdown", drawdownPct: opts.portfolioDrawdownPct }
  }

  // 5 — underweight drift (the fund furthest below its own range fires first)
  const under = positions
    .filter((p) => p.actualPct < p.rangeLow)
    .sort((a, b) => (b.rangeLow - b.actualPct) - (a.rangeLow - a.actualPct))
  if (under.length > 0) return { tag: "underweight", fund: under[0] }

  // 6 — standard: everything is within the user's own guardrails
  return { tag: "standard" }
}

export function computeNextMove(positions: FundPosition[], totalValue: number, opts: EngineOptions = {}): NextMove {
  const branch = route(positions, totalValue, opts)

  switch (branch.tag) {
    case "empty":
      return {
        severity: "none", ticker: null, action: "Add your holdings to get started",
        what: "Once you enter what you hold, this page will check it against the plan you built.",
        why: "There's nothing to check yet.", when: "Anytime.", color: "#6366f1",
      }

    case "hard_cap": {
      const f = branch.fund
      return {
        severity: "critical", ticker: f.ticker, action: `${f.ticker} is over the cap you set`,
        what: `${f.ticker} is ${f.actualPct.toFixed(1)}% of your portfolio — above the ${f.hardCap}% cap you set for it. New contributions are redirected away from ${f.ticker} until it's back under that cap.`,
        why: `This is the cap you defined for ${f.ticker} in your plan — this page only enforces it, it doesn't decide it.`,
        when: "This month, before adding to anything else.", color: "#ef4444",
      }
    }

    case "combined_hard": {
      const other = broadestFund(positions, branch.tickers)
      return {
        severity: "high", ticker: other?.ticker ?? null,
        action: `${branch.tickers.join(" + ")} are over the combined limit you set`,
        what: `${branch.tickers.join(" + ")} are ${branch.combined.toFixed(1)}% together — above the ${branch.hard}% combined limit you set for this group. New contributions go to ${other?.ticker ?? "another fund in your plan"} instead.`,
        why: "This is the combined-ceiling rule you defined for this group of funds.",
        when: "This month.", color: "#f59e0b",
      }
    }

    case "floor": {
      const f = branch.fund
      return {
        severity: "high", ticker: f.ticker, action: `${f.ticker} is below the floor you set`,
        what: `${f.ticker} is ${f.actualPct.toFixed(1)}% — below the ${f.floor}% floor you set for it. New contributions go to ${f.ticker} until it's back above that floor.`,
        why: `This is the minimum you defined for ${f.ticker} in your plan.`,
        when: "This month, until it's back above the floor.", color: f.color,
      }
    }

    case "drawdown": {
      const target = broadestFund(positions)
      return {
        severity: "high", ticker: target?.ticker ?? null, action: "Drawdown trigger reached",
        what: `Your portfolio is down ${Math.abs(branch.drawdownPct).toFixed(0)}% from its recent high — past the drawdown trigger you set. New contributions go to ${target?.ticker ?? "your largest-weighted fund"} instead of the standard split.`,
        why: "This is the drawdown response you defined in your plan.",
        when: "This month.", color: target?.color ?? "#6366f1",
      }
    }

    case "underweight": {
      const f = branch.fund
      return {
        severity: "medium", ticker: f.ticker, action: `${f.ticker} is below the range you set`,
        what: `${f.ticker} is ${f.actualPct.toFixed(1)}% — below the ${f.rangeLow}% low end of the range you set. New contributions go to ${f.ticker} until it's back in range.`,
        why: "This is the range you defined for this fund — new money fixes drift without needing to sell anything.",
        when: "This month.", color: f.color,
      }
    }

    case "standard":
      return {
        severity: "none", ticker: null, action: "Everything is within the ranges you set",
        what: "Split this month's contribution at your target weights — nothing is outside the guardrails you defined.",
        why: "No rule you set is currently breached.", when: "Anytime this month.", color: "#22c55e",
      }
  }
}

export function computeDcaSplit(positions: FundPosition[], monthly: number, opts: EngineOptions = {}): DcaPlan {
  const alloc: Record<string, DcaAllocation> = {}
  const totalTarget = positions.reduce((s, p) => s + p.targetPct, 0) || 1
  for (const p of positions) {
    alloc[p.ticker] = {
      ticker: p.ticker, name: p.name, color: p.color, amount: 0,
      standardAmount: Math.round((p.targetPct / totalTarget) * monthly / 10) * 10,
      tag: "zeroed", reason: "",
    }
  }
  if (monthly <= 0 || positions.length === 0) {
    return { allocations: Object.values(alloc), headline: "No contribution to deploy.", overlayNote: null }
  }

  const round10 = (n: number) => Math.round(n / 10) * 10
  const totalValue = positions.reduce((s, p) => s + p.value, 0)
  const branch = route(positions, totalValue, opts)

  function allToOne(ticker: string | undefined, reason: string, note: string): DcaPlan {
    const target = ticker && alloc[ticker] ? ticker : Object.keys(alloc)[0]
    if (!target) return { allocations: Object.values(alloc), headline: "No fund to route to.", overlayNote: note }
    alloc[target].amount = monthly
    alloc[target].tag = "boosted"
    alloc[target].reason = reason
    for (const p of positions) if (p.ticker !== target && !alloc[p.ticker].reason) alloc[p.ticker].reason = "Paused this month, per your plan's rule."
    return { allocations: Object.values(alloc), headline: "Directed plan — one fund this month", overlayNote: note }
  }

  switch (branch.tag) {
    case "empty":
      return { allocations: Object.values(alloc), headline: "No contribution to deploy.", overlayNote: null }

    case "hard_cap":
      return allToOne(broadestFund(positions, [branch.fund.ticker])?.ticker, `${branch.fund.ticker} is over its cap — paused.`, `${branch.fund.ticker} is over the cap you set. New money is redirected elsewhere until it's back under.`)

    case "combined_hard": {
      const other = broadestFund(positions, branch.tickers)
      return allToOne(other?.ticker, "Combined group over its limit — redirected.", `${branch.tickers.join(" + ")} are over the combined limit you set. New money goes to ${other?.ticker ?? "another fund"} instead.`)
    }

    case "floor":
      return allToOne(branch.fund.ticker, "Below its floor — topping up first.", `${branch.fund.ticker} is below the floor you set — all new money goes there first.`)

    case "drawdown": {
      const target = broadestFund(positions)
      return allToOne(target?.ticker, "Drawdown trigger reached — redirected.", `Your drawdown trigger fired. New money goes to ${target?.ticker ?? "your largest-weighted fund"} instead of the standard split.`)
    }

    case "underweight":
      return allToOne(branch.fund.ticker, "Below its range — filling with new money.", `${branch.fund.ticker} is under the range you set — the full contribution fills it.`)

    case "standard": {
      let assigned = 0
      for (const p of positions) {
        const amt = round10((p.targetPct / totalTarget) * monthly)
        alloc[p.ticker].amount = amt
        alloc[p.ticker].tag = "standard"
        alloc[p.ticker].reason = "Standard split — within your target ranges."
        assigned += amt
      }
      const diff = monthly - assigned
      if (diff !== 0 && positions.length) {
        const big = positions.reduce((mi, p) => (alloc[p.ticker].amount > alloc[mi].amount ? p.ticker : mi), positions[0].ticker)
        alloc[big].amount += diff
      }
      return { allocations: Object.values(alloc), headline: "Standard plan — everything is within range", overlayNote: null }
    }
  }
}
