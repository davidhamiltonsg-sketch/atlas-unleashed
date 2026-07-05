"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Sparkles, RefreshCw } from "lucide-react"
import { refreshFundLookThroughAction } from "@/app/risk/actions"
import type { LookThroughResult } from "@/lib/look-through"

function daysAgo(d: string) {
  return Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000)
}

export function LookThroughCard({
  ticker,
  name,
  color,
  configured,
  cached,
}: {
  ticker: string
  name: string
  color: string
  configured: boolean
  cached: (Omit<LookThroughResult, "updatedAt"> & { updatedAt: string }) | null
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  function fetchIt() {
    setError(null)
    startTransition(async () => {
      const result = await refreshFundLookThroughAction(ticker)
      if (!result.success) setError(result.error)
      else router.refresh()
    })
  }

  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full shrink-0" style={{ background: color }} />
          <span className="text-xs font-bold">{ticker}</span>
          <span className="text-[11px] text-muted-foreground truncate">{name}</span>
        </div>
        {configured && (
          <button type="button" onClick={fetchIt} disabled={isPending} className="flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline disabled:opacity-50 shrink-0">
            {cached ? <RefreshCw className={`h-3 w-3 ${isPending ? "animate-spin" : ""}`} /> : <Sparkles className="h-3 w-3" />}
            {isPending ? "Asking Claude…" : cached ? "Refresh" : "Get AI estimate"}
          </button>
        )}
      </div>

      {!configured && (
        <p className="text-[11px] text-muted-foreground">AI look-through isn&apos;t configured on this server.</p>
      )}

      {configured && error && <p className="text-[11px] text-red-600 dark:text-red-400">{error}</p>}

      {configured && !error && !cached && (
        <p className="text-[11px] text-muted-foreground">No estimate yet — ask Claude what it knows about this ticker&apos;s composition.</p>
      )}

      {configured && cached && (
        <div>
          <p className="text-[11px] text-muted-foreground mb-1.5">{cached.sector}</p>
          {cached.topHoldings.length > 0 && (
            <div className="space-y-1 mb-2">
              {cached.topHoldings.slice(0, 5).map((h) => (
                <div key={h.name} className="flex items-center justify-between text-[11px]">
                  <span>{h.name}</span>
                  <span className="tabular-nums text-muted-foreground">~{h.pct.toFixed(0)}%</span>
                </div>
              ))}
            </div>
          )}
          <div className="rounded-md bg-amber-500/10 border border-amber-500/20 px-2 py-1.5">
            <p className="text-[10px] text-amber-700 dark:text-amber-400">
              AI estimate ({cached.confidence} confidence), {daysAgo(cached.updatedAt)}d ago — verify against {ticker}&apos;s official fact sheet. {cached.note}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
