import { redirect } from "next/navigation"
import { getSession } from "@/lib/session"
import { getPortfolioSnapshot } from "@/lib/portfolio-data"
import { evaluateRules, type RuleCheck } from "@/lib/rules"
import { AppHeader } from "@/components/shell/app-header"
import { CheckCircle2, AlertTriangle, XCircle } from "lucide-react"

function StatusIcon({ status }: { status: RuleCheck["status"] }) {
  if (status === "breach") return <XCircle className="h-4 w-4 text-red-500 shrink-0" />
  if (status === "watch") return <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
  return <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
}

export default async function RulesPage() {
  const session = await getSession()
  if (!session) redirect("/login")

  const snap = await getPortfolioSnapshot(session.userId)
  if (!snap) redirect("/signup")

  const { userName, positions, combinedGroup, drawdownTriggerPct, portfolioDrawdownPct } = snap
  const result = evaluateRules(positions, { combinedGroup, drawdownTriggerPct, portfolioDrawdownPct })

  const fundChecks = result.checks.filter((c) => c.scope === "fund")
  const portfolioChecks = result.checks.filter((c) => c.scope === "portfolio")
  const hasHardLimits = positions.some((p) => p.hardCap !== null || p.floor !== null) || !!combinedGroup || drawdownTriggerPct != null

  return (
    <div className="min-h-screen bg-background">
      <AppHeader userName={userName} />

      <main className="max-w-4xl mx-auto px-5 py-6 space-y-5">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-primary">Rules</p>
          <h1 className="text-xl font-semibold mt-1">Every rule you set, checked live</h1>
          <p className="text-sm text-muted-foreground mt-1">
            These are the exact rules that drive this month&apos;s recommendation on the Compliance tab — nothing here was suggested to you, and this page only reports whether your own rules currently hold.
          </p>
        </div>

        {!hasHardLimits && (
          <div className="rounded-xl border border-border bg-muted/30 px-5 py-4">
            <p className="text-xs text-muted-foreground">
              You haven&apos;t set any hard caps, floors, a combined-ceiling group, or a drawdown trigger beyond your funds&apos; target ranges — those are optional. Every fund still has a comfortable range, checked below.
            </p>
          </div>
        )}

        <div className="rounded-2xl card-lux overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border">
            <p className="text-sm font-semibold">Per-fund rules</p>
          </div>
          <div className="divide-y divide-border">
            {fundChecks.map((c) => (
              <div key={c.id} className="px-5 py-3 flex items-start gap-3">
                <StatusIcon status={c.status} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold">{c.label}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{c.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {portfolioChecks.length > 0 && (
          <div className="rounded-2xl card-lux overflow-hidden">
            <div className="px-5 py-3.5 border-b border-border">
              <p className="text-sm font-semibold">Portfolio-wide rules</p>
            </div>
            <div className="divide-y divide-border">
              {portfolioChecks.map((c) => (
                <div key={c.id} className="px-5 py-3 flex items-start gap-3">
                  <StatusIcon status={c.status} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold">{c.label}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{c.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
