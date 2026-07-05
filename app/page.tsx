import { redirect } from "next/navigation"
import Link from "next/link"
import { getSession } from "@/lib/session"
import { db } from "@/lib/db"
import { computeNextMove, computeDcaSplit, type FundPosition, type CombinedGroup } from "@/lib/engine"
import { computePortfolioHealth } from "@/lib/health"
import { HoldingsList, type HoldingRow } from "@/components/dashboard/holdings-list"
import { logoutAction } from "@/app/actions"
import { LogOut, ShieldCheck } from "lucide-react"

function formatMoney(n: number) {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 })
}

async function getDashboardData(userId: string) {
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

  // Drawdown from the portfolio's own peak, across all recorded snapshot dates.
  const dateSet = [...new Set(holdings.flatMap((h) => h.snapshots.map((s) => s.date.toISOString())))].sort()
  const totalsByDate = dateSet.map((d) => holdings.reduce((sum, h) => {
    const snap = h.snapshots.find((s) => s.date.toISOString() === d)
    return sum + (snap?.value ?? 0)
  }, 0))
  let portfolioDrawdownPct: number | undefined
  if (totalsByDate.length >= 2) {
    const peak = Math.max(...totalsByDate)
    if (peak > 0 && totalValue < peak) portfolioDrawdownPct = ((totalValue - peak) / peak) * 100
  }

  const combinedGroup: CombinedGroup | null = constitution.combinedGroup ? JSON.parse(constitution.combinedGroup) : null
  const opts = { combinedGroup, drawdownTriggerPct: constitution.drawdownTriggerPct, portfolioDrawdownPct }

  const nextMove = computeNextMove(positions, totalValue, opts)
  const dca = computeDcaSplit(positions, user.monthlyContribution, opts)

  const hardBreaches = positions.filter((p) => p.hardCap !== null && p.actualPct > p.hardCap).length
  const floorBreaches = positions.filter((p) => p.floor !== null && p.actualPct < p.floor).length
  const softBreaches = positions.filter((p) => {
    const isHard = (p.hardCap !== null && p.actualPct > p.hardCap) || (p.floor !== null && p.actualPct < p.floor)
    return !isHard && (p.actualPct < p.rangeLow || p.actualPct > p.rangeHigh)
  }).length
  const maxDrift = positions.reduce((m, p) => Math.max(m, Math.abs(p.actualPct - p.targetPct)), 0)

  const latest = holdings.reduce<Date | null>((d, h) => { const s = h.snapshots[0]?.date; return s && (!d || s > d) ? s : d }, null)
  const snapshotAgeDays = latest ? Math.floor((Date.now() - latest.getTime()) / 86_400_000) : 999

  const health = computePortfolioHealth({ hardBreaches, floorBreaches, softBreaches, maxDrift, snapshotAgeDays, monthlyContribution: user.monthlyContribution })

  const rows: HoldingRow[] = positions.map((p) => {
    const h = holdings.find((x) => x.ticker === p.ticker)!
    const isHard = (p.hardCap !== null && p.actualPct > p.hardCap) || (p.floor !== null && p.actualPct < p.floor)
    const isSoft = !isHard && (p.actualPct < p.rangeLow || p.actualPct > p.rangeHigh)
    return {
      holdingId: h.id, ticker: p.ticker, name: p.name, color: p.color, value: p.value,
      actualPct: p.actualPct, targetPct: p.targetPct, rangeLow: p.rangeLow, rangeHigh: p.rangeHigh,
      hardCap: p.hardCap, floor: p.floor, status: isHard ? "breach" : isSoft ? "watch" : "ok",
    }
  })

  return { user, totalValue, hasBalance, nextMove, dca, health, rows, breaches: hardBreaches + floorBreaches, watches: softBreaches }
}

export default async function Dashboard() {
  const session = await getSession()
  if (!session) redirect("/login")

  const data = await getDashboardData(session.userId)
  if (!data) redirect("/signup")

  const { user, totalValue, hasBalance, nextMove, dca, health, rows, breaches, watches } = data

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="max-w-4xl mx-auto px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold">Atlas Unleashed</p>
            <p className="text-xs text-muted-foreground">{user.name}&apos;s plan</p>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/constitution" className="text-xs font-semibold text-primary hover:underline">View my plan</Link>
            <form action={logoutAction}>
              <button type="submit" className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
                <LogOut className="h-3.5 w-3.5" /> Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-5 py-6 space-y-5">
        {/* This month */}
        <div className="rounded-2xl card-lux overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-primary">This month</p>
              <p className="text-base font-semibold mt-0.5">{nextMove.action}</p>
            </div>
            <span className={`shrink-0 text-[10px] font-bold px-2.5 py-1 rounded-full border ${
              nextMove.severity === "critical" || nextMove.severity === "high" ? "border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400" :
              nextMove.severity === "medium" ? "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400" :
              "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
            }`}>
              {nextMove.severity === "none" ? "On track" : nextMove.severity === "medium" ? "Heads up" : nextMove.severity === "high" ? "Important" : "Act now"}
            </span>
          </div>
          <div className="divide-y divide-border/60">
            {dca.allocations.map((a) => (
              <div key={a.ticker} className="px-5 py-3 flex items-center gap-3">
                <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: a.color }} />
                <span className="font-bold text-sm w-16">{a.ticker}</span>
                <span className="flex-1 text-xs text-muted-foreground">{a.reason}</span>
                <span className={`text-sm font-bold tabular-nums ${a.amount > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}>
                  {a.amount > 0 ? `+${formatMoney(a.amount)}` : formatMoney(0)}
                </span>
              </div>
            ))}
          </div>
          <div className="m-4 rounded-lg border border-border bg-muted/30 p-4">
            <p className="text-xs leading-relaxed mb-1.5">{nextMove.what}</p>
            <p className="text-xs text-muted-foreground leading-relaxed">{nextMove.why}</p>
          </div>
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-2xl card-lux p-4">
            <p className="text-xs text-muted-foreground">Portfolio value</p>
            <p className="text-xl font-black tabular-nums mt-1">{hasBalance ? formatMoney(totalValue) : "—"}</p>
          </div>
          <div className="rounded-2xl card-lux p-4">
            <p className="text-xs text-muted-foreground">Health score</p>
            <p className={`text-xl font-black tabular-nums mt-1 ${health.overall >= 80 ? "text-emerald-600 dark:text-emerald-400" : health.overall >= 65 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"}`}>{health.overall}</p>
            <p className="text-[11px] text-muted-foreground">{health.overallLabel}</p>
          </div>
          <div className="rounded-2xl card-lux p-4">
            <p className="text-xs text-muted-foreground">Rule status</p>
            <p className={`text-xl font-black tabular-nums mt-1 ${breaches > 0 ? "text-red-600 dark:text-red-400" : watches > 0 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}`}>
              {breaches + watches === 0 ? "OK" : breaches + watches}
            </p>
            <p className="text-[11px] text-muted-foreground">{breaches} breach · {watches} watch</p>
          </div>
        </div>

        {!hasBalance && (
          <div className="rounded-xl border border-primary/30 bg-accent px-5 py-4">
            <p className="text-sm font-bold">Your plan is set up — add what you hold</p>
            <p className="text-xs text-muted-foreground mt-0.5">Your funds and guardrails are saved. Enter a value for each fund below to start tracking against your plan.</p>
          </div>
        )}

        <HoldingsList rows={rows} valueTrackingMode={user.valueTrackingMode as "manual" | "units_market"} />

        {/* Health scorecard */}
        <div className="rounded-2xl card-lux p-5">
          <div className="flex items-center gap-2 mb-4">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <p className="text-sm font-semibold">Health scorecard</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[health.allocation, health.compliance, health.freshness, health.contribution].map((d) => (
              <div key={d.label} className="rounded-lg border border-border p-3">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{d.label}</p>
                <p className={`text-lg font-black tabular-nums mt-1 ${
                  d.status === "excellent" || d.status === "good" ? "text-emerald-600 dark:text-emerald-400" :
                  d.status === "caution" ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"
                }`}>{d.score}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{d.description}</p>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}
