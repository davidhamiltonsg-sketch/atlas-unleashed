// ─────────────────────────────────────────────────────────────────────────────
// Atlas Unleashed — the single shared portfolio data fetcher.
//
// Every page (Compliance, Risk, Rules, Constitution) that needs positions,
// total value, or drawdown calls THIS function rather than re-querying and
// re-building FundPosition[] itself. Two pages independently computing "the
// same" position data is exactly the bug class fixed repeatedly in the sibling
// atlas-core session (surfaces silently disagreeing) — this makes it structurally
// impossible here.
// ─────────────────────────────────────────────────────────────────────────────

import { db } from "@/lib/db"
import type { FundPosition, CombinedGroup } from "@/lib/engine"

export interface TimelinePoint {
  date: string // ISO
  value: number
}

export interface PortfolioSnapshot {
  userId: string
  userName: string
  monthlyContribution: number
  valueTrackingMode: string
  constitutionId: string
  constitutionName: string
  combinedGroup: CombinedGroup | null
  drawdownTriggerPct: number | null
  positions: FundPosition[]
  totalValue: number
  hasBalance: boolean
  portfolioDrawdownPct: number | null
  timeline: TimelinePoint[]
  holdingIdByTicker: Record<string, string>
}

export async function getPortfolioSnapshot(userId: string): Promise<PortfolioSnapshot | null> {
  const [user, constitution, holdings] = await Promise.all([
    db.user.findUnique({ where: { id: userId } }),
    db.constitution.findUnique({ where: { userId }, include: { funds: true } }),
    db.holding.findMany({ where: { userId }, include: { snapshots: { orderBy: { date: "desc" } } } }),
  ])
  if (!user || !constitution) return null

  const totalValue = holdings.reduce((s, h) => s + (h.snapshots[0]?.value ?? 0), 0)
  const hasBalance = totalValue > 0

  const positions: FundPosition[] = constitution.funds.map((f) => {
    const h = holdings.find((x) => x.ticker === f.ticker)
    const value = h?.snapshots[0]?.value ?? 0
    const actualPct = totalValue > 0 ? (value / totalValue) * 100 : 0
    return {
      ticker: f.ticker, name: f.name, color: f.color, value, actualPct,
      targetPct: f.targetPct, rangeLow: f.rangeLow, rangeHigh: f.rangeHigh,
      hardCap: f.hardCap, floor: f.floor,
    }
  })

  // Value-over-time, for performance/volatility. Bucketed by CALENDAR DAY (not exact
  // timestamp) and forward-filled: different funds get updated at different moments
  // (even a few milliseconds apart during signup), so matching on the exact instant
  // would split one real portfolio snapshot into several incomplete ones, each missing
  // whichever funds weren't updated at that precise millisecond. `snapshots` is already
  // ordered newest-first, so the first match at or before a given day is that fund's
  // carried-forward value as of that day.
  const daySet = [...new Set(holdings.flatMap((h) => h.snapshots.map((s) => s.date.toISOString().split("T")[0])))].sort()
  const timeline: TimelinePoint[] = daySet.map((day) => ({
    date: day,
    value: holdings.reduce((sum, h) => {
      const asOf = h.snapshots.find((s) => s.date.toISOString().split("T")[0] <= day)
      return sum + (asOf?.value ?? 0)
    }, 0),
  }))

  let portfolioDrawdownPct: number | null = null
  if (timeline.length >= 2) {
    const peak = Math.max(...timeline.map((t) => t.value))
    if (peak > 0 && totalValue < peak) portfolioDrawdownPct = ((totalValue - peak) / peak) * 100
  }

  return {
    userId: user.id, userName: user.name, monthlyContribution: user.monthlyContribution,
    valueTrackingMode: user.valueTrackingMode, constitutionId: constitution.id, constitutionName: constitution.name,
    combinedGroup: constitution.combinedGroup ? JSON.parse(constitution.combinedGroup) : null,
    drawdownTriggerPct: constitution.drawdownTriggerPct,
    positions, totalValue, hasBalance, portfolioDrawdownPct, timeline,
    holdingIdByTicker: Object.fromEntries(holdings.map((h) => [h.ticker, h.id])),
  }
}
