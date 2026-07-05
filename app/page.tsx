import { redirect } from "next/navigation"
import { getSession } from "@/lib/session"
import { getPortfolioSnapshot } from "@/lib/portfolio-data"
import { computeNextMove, computeDcaSplit } from "@/lib/engine"
import { computePortfolioHealth } from "@/lib/health"
import { HoldingsList, type HoldingRow } from "@/components/dashboard/holdings-list"
import { AppHeader } from "@/components/shell/app-header"
import { ShieldCheck, TrendingUp, TrendingDown } from "lucide-react"

function formatMoney(n: number) {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 })
}

function daysSince(date: Date): number {
  return Math.floor((Date.now() - date.getTime()) / 86_400_000)
}

export default async function Dashboard() {
  const session = await getSession()
  if (!session) redirect("/login")

  const snap = await getPortfolioSnapshot(session.userId)
  if (!snap) redirect("/signup")

  const { userName, monthlyContribution, valueTrackingMode, combinedGroup, drawdownTriggerPct, positions, totalValue, hasBalance, portfolioDrawdownPct, timeline, holdingIdByTicker } = snap
  const opts = { combinedGroup, drawdownTriggerPct, portfolioDrawdownPct }

  const nextMove = computeNextMove(positions, totalValue, opts)
  const dca = computeDcaSplit(positions, monthlyContribution, opts)

  const hardBreaches = positions.filter((p) => p.hardCap !== null && p.actualPct > p.hardCap).length
  const floorBreaches = positions.filter((p) => p.floor !== null && p.actualPct < p.floor).length
  const softBreaches = positions.filter((p) => {
    const isHard = (p.hardCap !== null && p.actualPct > p.hardCap) || (p.floor !== null && p.actualPct < p.floor)
    return !isHard && (p.actualPct < p.rangeLow || p.actualPct > p.rangeHigh)
  }).length
  const maxDrift = positions.reduce((m, p) => Math.max(m, Math.abs(p.actualPct - p.targetPct)), 0)
  const snapshotAgeDays = timeline.length ? daysSince(new Date(timeline[timeline.length - 1].date)) : 999

  const health = computePortfolioHealth({ hardBreaches, floorBreaches, softBreaches, maxDrift, snapshotAgeDays, monthlyContribution })
  const breaches = hardBreaches + floorBreaches
  const watches = softBreaches

  const rows: HoldingRow[] = positions.map((p) => {
    const isHard = (p.hardCap !== null && p.actualPct > p.hardCap) || (p.floor !== null && p.actualPct < p.floor)
    const isSoft = !isHard && (p.actualPct < p.rangeLow || p.actualPct > p.rangeHigh)
    return {
      holdingId: holdingIdByTicker[p.ticker] ?? p.ticker, ticker: p.ticker, name: p.name, color: p.color, value: p.value,
      actualPct: p.actualPct, targetPct: p.targetPct, rangeLow: p.rangeLow, rangeHigh: p.rangeHigh,
      hardCap: p.hardCap, floor: p.floor, status: isHard ? "breach" : isSoft ? "watch" : "ok",
    }
  })

  // Performance — since the first recorded snapshot, and since the previous one.
  const sinceInception = timeline.length >= 2 ? totalValue - timeline[0].value : null
  const sincePrevious = timeline.length >= 2 ? totalValue - timeline[timeline.length - 2].value : null

  return (
    <div className="min-h-screen bg-background">
      <AppHeader userName={userName} />

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

        {/* Performance */}
        {(sinceInception !== null || sincePrevious !== null) && (
          <div className="rounded-2xl card-lux p-5">
            <p className="text-sm font-semibold mb-3">Performance</p>
            <div className="grid grid-cols-2 gap-3">
              {sincePrevious !== null && (
                <div>
                  <p className="text-xs text-muted-foreground">Since last update</p>
                  <p className={`text-lg font-black tabular-nums mt-0.5 flex items-center gap-1 ${sincePrevious >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                    {sincePrevious >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                    {sincePrevious >= 0 ? "+" : ""}{formatMoney(sincePrevious)}
                  </p>
                </div>
              )}
              {sinceInception !== null && (
                <div>
                  <p className="text-xs text-muted-foreground">Since you started tracking</p>
                  <p className={`text-lg font-black tabular-nums mt-0.5 flex items-center gap-1 ${sinceInception >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                    {sinceInception >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                    {sinceInception >= 0 ? "+" : ""}{formatMoney(sinceInception)}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {!hasBalance && (
          <div className="rounded-xl border border-primary/30 bg-accent px-5 py-4">
            <p className="text-sm font-bold">Your plan is set up — add what you hold</p>
            <p className="text-xs text-muted-foreground mt-0.5">Your funds and guardrails are saved. Enter a value for each fund below to start tracking against your plan.</p>
          </div>
        )}

        <HoldingsList rows={rows} valueTrackingMode={valueTrackingMode as "manual" | "units_market"} />

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
