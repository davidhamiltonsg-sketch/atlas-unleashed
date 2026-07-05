import { redirect } from "next/navigation"
import { getSession } from "@/lib/session"
import { db } from "@/lib/db"
import { AppHeader } from "@/components/shell/app-header"

function fmtHorizon(horizonYears: number | null, targetDate: Date | null) {
  if (horizonYears) return `${horizonYears} years`
  if (targetDate) return targetDate.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })
  return "Not set"
}

const TRACKING_LABEL: Record<string, string> = {
  manual: "You update the value manually",
  units_market: "Units held + a live market price lookup",
  broker: "Read-only broker sync",
}

export default async function ConstitutionPage() {
  const session = await getSession()
  if (!session) redirect("/login")

  const [user, constitution] = await Promise.all([
    db.user.findUnique({ where: { id: session.userId } }),
    db.constitution.findUnique({ where: { userId: session.userId }, include: { funds: true } }),
  ])
  if (!user || !constitution) redirect("/signup")

  const combinedGroup = constitution.combinedGroup ? JSON.parse(constitution.combinedGroup) as { tickers: string[]; hard: number } : null

  return (
    <div className="min-h-screen bg-background">
      <AppHeader userName={user.name} />

      <main className="max-w-3xl mx-auto px-5 py-8 space-y-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-primary">Your plan</p>
          <h1 className="text-2xl font-semibold mt-1">{constitution.name}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            This is what you built during onboarding. This app checks your portfolio against exactly these rules — nothing here was suggested to you.
          </p>
        </div>

        <div className="rounded-2xl card-lux p-5 grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div>
            <p className="text-xs text-muted-foreground">Investment horizon</p>
            <p className="text-sm font-semibold mt-0.5">{fmtHorizon(user.horizonYears, user.targetDate)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Monthly contribution</p>
            <p className="text-sm font-semibold mt-0.5">${user.monthlyContribution.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Tracking value via</p>
            <p className="text-sm font-semibold mt-0.5">{TRACKING_LABEL[user.valueTrackingMode] ?? user.valueTrackingMode}</p>
          </div>
        </div>

        <div>
          <p className="text-sm font-semibold mb-3">Your funds</p>
          <div className="rounded-2xl card-lux overflow-hidden divide-y divide-border">
            {constitution.funds.map((f) => (
              <div key={f.id} className="px-5 py-3.5">
                <div className="flex items-center gap-2 mb-1">
                  <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: f.color }} />
                  <span className="text-sm font-bold">{f.ticker}</span>
                  <span className="text-xs text-muted-foreground">{f.name}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Target {f.targetPct}% · range {f.rangeLow.toFixed(1)}%–{f.rangeHigh.toFixed(1)}%
                  {f.hardCap ? ` · hard cap ${f.hardCap}%` : ""}
                  {f.floor ? ` · floor ${f.floor}%` : ""}
                </p>
              </div>
            ))}
          </div>
        </div>

        {(combinedGroup || constitution.drawdownTriggerPct) && (
          <div>
            <p className="text-sm font-semibold mb-3">Portfolio-wide rules</p>
            <div className="rounded-2xl card-lux p-5 space-y-2 text-xs">
              {combinedGroup && <p>{combinedGroup.tickers.join(" + ")} together must stay under {combinedGroup.hard}%.</p>}
              {constitution.drawdownTriggerPct && <p>A {constitution.drawdownTriggerPct}% drawdown from your portfolio&apos;s peak redirects new contributions to your largest-weighted fund.</p>}
            </div>
          </div>
        )}

        <div className="rounded-xl border border-border bg-muted/30 px-5 py-4">
          <p className="text-xs text-muted-foreground leading-relaxed">
            <span className="font-semibold text-foreground">What this app does — and doesn&apos;t do.</span>{" "}
            It checks your holdings against the rules above and tells you when something drifts outside them. It never recommends a fund, a weight, or a trade, and it never places one — any broker connection is read-only.
          </p>
        </div>
      </main>
    </div>
  )
}
