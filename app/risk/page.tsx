import { redirect } from "next/navigation"
import { getSession } from "@/lib/session"
import { getPortfolioSnapshot } from "@/lib/portfolio-data"
import { computeConcentration, computeVolatility } from "@/lib/risk"
import { getCachedLookThrough, lookThroughConfigured, aggregateCompanies } from "@/lib/look-through"
import { AppHeader } from "@/components/shell/app-header"
import { LookThroughCard } from "@/components/dashboard/look-through-card"
import { AlertTriangle, PieChart, Activity } from "lucide-react"

function formatMoney(n: number) {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 })
}

export default async function RiskPage() {
  const session = await getSession()
  if (!session) redirect("/login")

  const snap = await getPortfolioSnapshot(session.userId)
  if (!snap) redirect("/signup")

  const { userName, positions, hasBalance, portfolioDrawdownPct, timeline } = snap

  const concentration = computeConcentration(positions)
  const volatility = computeVolatility(timeline)
  const configured = lookThroughConfigured()

  const cachedResults = await Promise.all(positions.map((p) => getCachedLookThrough(p.ticker)))
  const lookThroughByTicker = Object.fromEntries(
    cachedResults.filter((r): r is NonNullable<typeof r> => r !== null).map((r) => [r.ticker, r])
  )
  const missingCount = positions.length - Object.keys(lookThroughByTicker).length
  const aggregatedCompanies = aggregateCompanies(positions, lookThroughByTicker)

  const sortedByConcentration = [...positions].sort((a, b) => b.actualPct - a.actualPct)

  return (
    <div className="min-h-screen bg-background">
      <AppHeader userName={userName} />

      <main className="max-w-4xl mx-auto px-5 py-6 space-y-5">
        {!hasBalance ? (
          <div className="rounded-xl border border-primary/30 bg-accent px-5 py-4">
            <p className="text-sm font-bold">No holdings yet</p>
            <p className="text-xs text-muted-foreground mt-0.5">Add what you hold on the Compliance tab to see risk metrics here.</p>
          </div>
        ) : (
          <>
            {/* Concentration + drawdown + volatility */}
            <div className="grid sm:grid-cols-3 gap-3">
              <div className="rounded-2xl card-lux p-4">
                <div className="flex items-center gap-1.5 mb-1">
                  <PieChart className="h-3.5 w-3.5 text-primary" />
                  <p className="text-xs text-muted-foreground">Concentration</p>
                </div>
                <p className={`text-lg font-black mt-0.5 ${
                  concentration.rating === "Diversified" ? "text-emerald-600 dark:text-emerald-400" :
                  concentration.rating === "Moderate" ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"
                }`}>{concentration.rating}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">HHI {concentration.hhiPct.toFixed(1)} · behaves like {concentration.effectiveN.toFixed(1)} equal positions</p>
              </div>
              <div className="rounded-2xl card-lux p-4">
                <div className="flex items-center gap-1.5 mb-1">
                  <AlertTriangle className="h-3.5 w-3.5 text-primary" />
                  <p className="text-xs text-muted-foreground">Drawdown from peak</p>
                </div>
                <p className="text-lg font-black tabular-nums mt-0.5">{portfolioDrawdownPct ? `${portfolioDrawdownPct.toFixed(1)}%` : "0%"}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{timeline.length < 2 ? "Not enough history yet" : "Since your recorded peak value"}</p>
              </div>
              <div className="rounded-2xl card-lux p-4">
                <div className="flex items-center gap-1.5 mb-1">
                  <Activity className="h-3.5 w-3.5 text-primary" />
                  <p className="text-xs text-muted-foreground">Volatility</p>
                </div>
                {volatility ? (
                  <>
                    <p className="text-lg font-black tabular-nums mt-0.5">±{volatility.stdevPct.toFixed(1)}%</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">Per-update swing, {volatility.sampleSize} updates recorded</p>
                  </>
                ) : (
                  <>
                    <p className="text-lg font-black mt-0.5 text-muted-foreground">—</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">Not enough history yet — needs a few value updates</p>
                  </>
                )}
              </div>
            </div>

            {/* What's owned, where */}
            <div className="rounded-2xl card-lux overflow-hidden">
              <div className="px-5 py-3.5 border-b border-border">
                <p className="text-sm font-semibold">What&apos;s owned — by concentration</p>
                <p className="text-xs text-muted-foreground mt-0.5">Largest position first — this is where your risk actually concentrates.</p>
              </div>
              <div className="divide-y divide-border">
                {sortedByConcentration.map((p) => {
                  const contributionPct = concentration.hhiPct > 0 ? (Math.pow(p.actualPct / 100, 2) * 100 / concentration.hhiPct) * 100 : 0
                  return (
                    <div key={p.ticker} className="px-5 py-3 flex items-center gap-3">
                      <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: p.color }} />
                      <span className="w-16 shrink-0 text-sm font-bold">{p.ticker}</span>
                      <span className="flex-1 text-xs text-muted-foreground truncate">{p.name}</span>
                      <span className="w-20 shrink-0 text-right text-xs tabular-nums">{p.actualPct.toFixed(1)}%</span>
                      <span className="w-28 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{contributionPct.toFixed(0)}% of concentration</span>
                      <span className="w-24 shrink-0 text-right text-sm font-bold tabular-nums">{formatMoney(p.value)}</span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Look-through */}
            <div className="rounded-2xl card-lux p-5">
              <p className="text-sm font-semibold mb-1">Detailed look-through</p>
              <p className="text-xs text-muted-foreground mb-4">
                What each fund actually holds underneath, estimated by Claude from its training knowledge — not verified fund data. {!configured && "Not available on this server yet."}
              </p>
              {aggregatedCompanies.length > 0 && (
                <div className="mb-4 rounded-lg bg-muted/30 border border-border p-3">
                  <p className="text-[11px] font-semibold text-muted-foreground mb-2">Combined top exposures across your funds{missingCount > 0 ? ` (${missingCount} fund${missingCount > 1 ? "s" : ""} not yet estimated)` : ""}</p>
                  <div className="space-y-1">
                    {aggregatedCompanies.slice(0, 6).map((c) => (
                      <div key={c.name} className="flex items-center justify-between text-xs">
                        <span>{c.name}</span>
                        <span className="tabular-nums text-muted-foreground">~{c.pct.toFixed(1)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="space-y-2">
                {positions.map((p) => (
                  <LookThroughCard
                    key={p.ticker}
                    ticker={p.ticker}
                    name={p.name}
                    color={p.color}
                    configured={configured}
                    cached={lookThroughByTicker[p.ticker] ? { ...lookThroughByTicker[p.ticker], updatedAt: lookThroughByTicker[p.ticker].updatedAt.toISOString() } : null}
                  />
                ))}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
