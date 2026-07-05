"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Pencil, Check, X, RefreshCw, AlertTriangle, CheckCircle2 } from "lucide-react"
import { updateHoldingValueAction, refreshMarketPricesAction } from "@/app/holdings/actions"
import type { ValueTrackingMode } from "@/lib/plan-types"

export interface HoldingRow {
  holdingId: string
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
  status: "ok" | "watch" | "breach"
}

function formatMoney(n: number) {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 })
}

function StatusPill({ status }: { status: HoldingRow["status"] }) {
  if (status === "breach") return <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 text-red-600 dark:text-red-400 px-2 py-0.5 text-[10px] font-bold"><AlertTriangle className="h-2.5 w-2.5" /> Over limit</span>
  if (status === "watch") return <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 px-2 py-0.5 text-[10px] font-bold"><AlertTriangle className="h-2.5 w-2.5" /> Drift</span>
  return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 text-[10px] font-bold"><CheckCircle2 className="h-2.5 w-2.5" /> OK</span>
}

function EditableValue({ row }: { row: HoldingRow }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(String(row.value))
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  if (!editing) {
    return (
      <button type="button" onClick={() => setEditing(true)} className="group flex items-center gap-1.5 justify-end w-full">
        <span className="text-sm font-bold tabular-nums">{formatMoney(row.value)}</span>
        <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
      </button>
    )
  }

  function save() {
    startTransition(async () => {
      const result = await updateHoldingValueAction(row.holdingId, Number(value))
      if (!result?.error) { setEditing(false); router.refresh() }
    })
  }

  return (
    <div className="flex items-center gap-1 justify-end">
      <input autoFocus type="number" value={value} onChange={(e) => setValue(e.target.value)} className="input-field w-24 text-right py-1" />
      <button type="button" onClick={save} disabled={isPending} className="text-emerald-600 dark:text-emerald-400"><Check className="h-4 w-4" /></button>
      <button type="button" onClick={() => setEditing(false)} className="text-muted-foreground"><X className="h-4 w-4" /></button>
    </div>
  )
}

export function HoldingsList({ rows, valueTrackingMode }: { rows: HoldingRow[]; valueTrackingMode: ValueTrackingMode }) {
  const [refreshing, startTransition] = useTransition()
  const [note, setNote] = useState<string | null>(null)
  const router = useRouter()

  function refresh() {
    startTransition(async () => {
      const result = await refreshMarketPricesAction()
      if (result?.error) setNote(result.error)
      else { setNote(`Updated ${result?.updated}/${result?.total} funds.`); router.refresh() }
    })
  }

  return (
    <div className="rounded-2xl card-lux overflow-hidden">
      <div className="px-5 py-3.5 border-b border-border flex items-center justify-between">
        <p className="text-sm font-semibold">What&apos;s owned</p>
        {valueTrackingMode === "units_market" && (
          <button type="button" onClick={refresh} disabled={refreshing} className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline disabled:opacity-50">
            <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} /> {refreshing ? "Refreshing…" : "Refresh live prices"}
          </button>
        )}
      </div>
      {note && <p className="px-5 pt-2 text-[11px] text-muted-foreground">{note}</p>}
      <div className="divide-y divide-border">
        {rows.map((r) => (
          <div key={r.holdingId} className="px-5 py-3 flex items-center gap-3">
            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: r.color }} />
            <div className="w-16 shrink-0">
              <p className="text-sm font-bold">{r.ticker}</p>
            </div>
            <p className="flex-1 text-xs text-muted-foreground truncate">{r.name}</p>
            <div className="w-24 text-right shrink-0">
              <p className="text-xs tabular-nums">{r.actualPct.toFixed(1)}% <span className="text-muted-foreground">/ {r.targetPct}%</span></p>
            </div>
            <div className="w-28 shrink-0">
              {valueTrackingMode === "manual" ? <EditableValue row={r} /> : <p className="text-sm font-bold tabular-nums text-right">{formatMoney(r.value)}</p>}
            </div>
            <div className="w-24 shrink-0 text-right">
              <StatusPill status={r.status} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
