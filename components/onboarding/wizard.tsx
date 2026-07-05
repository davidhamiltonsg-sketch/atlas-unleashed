"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Check, ChevronRight, ChevronLeft, Plus, Trash2, Loader2 } from "lucide-react"
import { signupAction } from "@/app/signup/actions"
import { FUND_COLORS, type WizardData, type WizardFund, type ValueTrackingMode } from "@/lib/plan-types"

const STEPS = ["Account", "Horizon", "Funds", "Starting point", "Guardrails", "Review"] as const

function emptyFund(index: number): WizardFund {
  return { ticker: "", name: "", color: FUND_COLORS[index % FUND_COLORS.length], targetPct: 0, rangeLow: 0, rangeHigh: 0, hardCap: null, floor: null, amount: 0 }
}

function StepDots({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-2 mb-8">
      {STEPS.map((label, i) => (
        <div key={label} className="flex items-center gap-2 flex-1">
          <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors ${
            i < step ? "btn-brand" : i === step ? "border-2 border-primary text-primary" : "border border-border text-muted-foreground"
          }`}>
            {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
          </div>
          {i < STEPS.length - 1 && <div className={`h-0.5 flex-1 rounded ${i < step ? "bg-primary" : "bg-border"}`} />}
        </div>
      ))}
    </div>
  )
}

export function OnboardingWizard() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")

  const [horizonMode, setHorizonMode] = useState<"years" | "date">("years")
  const [horizonYears, setHorizonYears] = useState(10)
  const [targetDate, setTargetDate] = useState("")

  const [funds, setFunds] = useState<WizardFund[]>([emptyFund(0), emptyFund(1)])

  const [monthlyContribution, setMonthlyContribution] = useState(500)
  const [valueTrackingMode, setValueTrackingMode] = useState<ValueTrackingMode>("manual")

  const [combinedEnabled, setCombinedEnabled] = useState(false)
  const [combinedTickers, setCombinedTickers] = useState<[string, string]>(["", ""])
  const [combinedHard, setCombinedHard] = useState(50)
  const [drawdownEnabled, setDrawdownEnabled] = useState(false)
  const [drawdownTriggerPct, setDrawdownTriggerPct] = useState(15)

  const weightSum = funds.reduce((s, f) => s + (f.targetPct || 0), 0)

  function updateFund(i: number, patch: Partial<WizardFund>) {
    setFunds((prev) => prev.map((f, idx) => (idx === i ? { ...f, ...patch } : f)))
  }
  function addFund() {
    if (funds.length >= 8) return
    setFunds((prev) => [...prev, emptyFund(prev.length)])
  }
  function removeFund(i: number) {
    if (funds.length <= 2) return
    setFunds((prev) => prev.filter((_, idx) => idx !== i))
  }

  function next() {
    setError(null)
    if (step === 0) {
      if (!name.trim() || !email.trim() || password.length < 8) {
        setError("Enter your name, email, and a password of at least 8 characters."); return
      }
    }
    if (step === 1) {
      if (horizonMode === "years" && (!horizonYears || horizonYears <= 0)) { setError("Enter how many years you're investing for."); return }
      if (horizonMode === "date" && !targetDate) { setError("Pick a target date."); return }
    }
    if (step === 2) {
      if (funds.some((f) => !f.ticker.trim() || !f.name.trim())) { setError("Every fund needs a ticker and a name."); return }
      if (Math.abs(weightSum - 100) > 0.5) { setError(`Your target weights add up to ${weightSum.toFixed(1)}% — they need to sum to 100%.`); return }
    }
    if (step === 3) {
      if (monthlyContribution < 0) { setError("Monthly contribution can't be negative."); return }
      if (funds.some((f) => f.amount < 0)) { setError("Amounts can't be negative."); return }
    }
    if (step === 4) {
      if (combinedEnabled && (!combinedTickers[0] || !combinedTickers[1] || combinedTickers[0] === combinedTickers[1])) {
        setError("Pick two different funds for the combined-ceiling group, or turn it off."); return
      }
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1))
  }
  function back() {
    setError(null)
    setStep((s) => Math.max(s - 1, 0))
  }

  function submit() {
    setError(null)
    const data: WizardData = {
      name, email, password,
      horizonYears: horizonMode === "years" ? horizonYears : null,
      targetDate: horizonMode === "date" ? targetDate : null,
      monthlyContribution,
      valueTrackingMode,
      funds: funds.map((f) => ({
        ...f,
        ticker: f.ticker.trim().toUpperCase(),
        rangeLow: Math.max(0, f.targetPct - f.rangeLow),
        rangeHigh: f.targetPct + f.rangeHigh,
      })),
      combinedGroup: combinedEnabled ? { tickers: combinedTickers, hard: combinedHard } : null,
      drawdownTriggerPct: drawdownEnabled ? drawdownTriggerPct : null,
    }
    startTransition(async () => {
      const result = await signupAction(data)
      if (result?.error) setError(result.error)
      else router.push("/")
    })
  }

  return (
    <div className="w-full max-w-2xl mx-auto">
      <StepDots step={step} />
      <div className="rounded-2xl card-lux p-6 sm:p-8">
        <h2 className="text-lg font-semibold mb-1">{STEPS[step]}</h2>

        {step === 0 && (
          <div className="space-y-4 mt-5">
            <p className="text-xs text-muted-foreground -mt-3 mb-4">Your account — nothing here is shared or suggested, it&apos;s just you.</p>
            <Field label="Name"><input className="input-field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" /></Field>
            <Field label="Email"><input type="email" className="input-field" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" /></Field>
            <Field label="Password"><input type="password" className="input-field" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" /></Field>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4 mt-5">
            <p className="text-xs text-muted-foreground -mt-3 mb-4">How long you&apos;re planning to invest for — not why. This app never asks your goal, only your timeframe.</p>
            <div className="flex gap-2">
              <ModeButton active={horizonMode === "years"} onClick={() => setHorizonMode("years")}>Number of years</ModeButton>
              <ModeButton active={horizonMode === "date"} onClick={() => setHorizonMode("date")}>A target date</ModeButton>
            </div>
            {horizonMode === "years" ? (
              <Field label="Years"><input type="number" min={1} className="input-field" value={horizonYears} onChange={(e) => setHorizonYears(Number(e.target.value))} /></Field>
            ) : (
              <Field label="Target date"><input type="date" className="input-field" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} /></Field>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3 mt-5">
            <p className="text-xs text-muted-foreground -mt-3 mb-4">Add the funds you hold or plan to hold, and the weight you want each at. These are your choices — nothing here is a suggestion.</p>
            {funds.map((f, i) => (
              <div key={i} className="flex items-center gap-2 rounded-lg border border-border p-3">
                <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: f.color }} />
                <input className="input-field flex-[0_0_90px]" placeholder="Ticker" value={f.ticker} onChange={(e) => updateFund(i, { ticker: e.target.value })} />
                <input className="input-field flex-1" placeholder="Fund name" value={f.name} onChange={(e) => updateFund(i, { name: e.target.value })} />
                <div className="flex items-center gap-1 shrink-0">
                  <input type="number" className="input-field w-20 text-right" placeholder="0" value={f.targetPct || ""} onChange={(e) => updateFund(i, { targetPct: Number(e.target.value) })} />
                  <span className="text-xs text-muted-foreground">%</span>
                </div>
                <button type="button" onClick={() => removeFund(i)} disabled={funds.length <= 2} className="shrink-0 text-muted-foreground hover:text-red-500 disabled:opacity-30 disabled:hover:text-muted-foreground">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            <button type="button" onClick={addFund} disabled={funds.length >= 8} className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline disabled:opacity-40">
              <Plus className="h-3.5 w-3.5" /> Add a fund
            </button>
            <p className={`text-xs font-semibold ${Math.abs(weightSum - 100) < 0.5 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
              Total: {weightSum.toFixed(1)}% {Math.abs(weightSum - 100) < 0.5 ? "✓" : "— needs to total 100%"}
            </p>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-5 mt-5">
            <Field label="Monthly contribution ($)"><input type="number" min={0} className="input-field" value={monthlyContribution} onChange={(e) => setMonthlyContribution(Number(e.target.value))} /></Field>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-2">How should this app track your value?</label>
              <div className="space-y-2">
                <ModeCard active={valueTrackingMode === "manual"} onClick={() => setValueTrackingMode("manual")} title="Manual value" desc="You type in your current total whenever you check in." />
                <ModeCard active={valueTrackingMode === "units_market"} onClick={() => setValueTrackingMode("units_market")} title="Units + live market price" desc="Enter units held once — this app fetches the current price for each ticker." />
                <ModeCard disabled title="Connect a broker (read-only)" desc="Coming soon — IBKR first. Read-only: this app can never place a trade." />
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">{valueTrackingMode === "manual" ? "Current value per fund ($)" : "Units held per fund"}</p>
              {funds.map((f, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ background: f.color }} />
                  <span className="text-xs w-16 shrink-0">{f.ticker || "—"}</span>
                  <input type="number" min={0} className="input-field" value={f.amount || ""} onChange={(e) => updateFund(i, { amount: Number(e.target.value) })} placeholder="0" />
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-5 mt-5">
            <p className="text-xs text-muted-foreground -mt-3">Set the tolerance band and any caps for each fund — these are the numbers this app will check your portfolio against.</p>
            <div className="space-y-2">
              {funds.map((f, i) => (
                <div key={i} className="rounded-lg border border-border p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full shrink-0" style={{ background: f.color }} />
                    <span className="text-xs font-semibold">{f.ticker || "—"}</span>
                    <span className="text-[11px] text-muted-foreground">target {f.targetPct}%</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <MiniField label="Tolerance band (±%)" value={f.rangeLow} onChange={(v) => updateFund(i, { rangeLow: v, rangeHigh: v })} />
                    <MiniField label="Hard cap (%, optional)" value={f.hardCap ?? ""} onChange={(v) => updateFund(i, { hardCap: v || null })} />
                    <MiniField label="Floor (%, optional)" value={f.floor ?? ""} onChange={(v) => updateFund(i, { floor: v || null })} />
                  </div>
                </div>
              ))}
            </div>

            <label className="flex items-center gap-2 text-xs font-medium">
              <input type="checkbox" checked={combinedEnabled} onChange={(e) => setCombinedEnabled(e.target.checked)} />
              Group two funds under one combined ceiling
            </label>
            {combinedEnabled && (
              <div className="grid grid-cols-3 gap-2 pl-6">
                <select className="input-field" value={combinedTickers[0]} onChange={(e) => setCombinedTickers([e.target.value, combinedTickers[1]])}>
                  <option value="">Fund A</option>
                  {funds.map((f) => <option key={f.ticker} value={f.ticker}>{f.ticker}</option>)}
                </select>
                <select className="input-field" value={combinedTickers[1]} onChange={(e) => setCombinedTickers([combinedTickers[0], e.target.value])}>
                  <option value="">Fund B</option>
                  {funds.map((f) => <option key={f.ticker} value={f.ticker}>{f.ticker}</option>)}
                </select>
                <input type="number" className="input-field" placeholder="Combined cap %" value={combinedHard} onChange={(e) => setCombinedHard(Number(e.target.value))} />
              </div>
            )}

            <label className="flex items-center gap-2 text-xs font-medium">
              <input type="checkbox" checked={drawdownEnabled} onChange={(e) => setDrawdownEnabled(e.target.checked)} />
              Set a portfolio drawdown trigger
            </label>
            {drawdownEnabled && (
              <div className="pl-6">
                <input type="number" className="input-field w-32" value={drawdownTriggerPct} onChange={(e) => setDrawdownTriggerPct(Number(e.target.value))} />
                <span className="text-xs text-muted-foreground ml-2">% down from peak</span>
              </div>
            )}
          </div>
        )}

        {step === 5 && (
          <div className="space-y-4 mt-5 text-sm">
            <p className="text-xs text-muted-foreground -mt-3">Here&apos;s the plan you built. Nothing below was suggested by this app.</p>
            <SummaryRow label="Horizon" value={horizonMode === "years" ? `${horizonYears} years` : targetDate} />
            <SummaryRow label="Monthly contribution" value={`$${monthlyContribution.toLocaleString()}`} />
            <SummaryRow label="Tracking value via" value={valueTrackingMode === "manual" ? "Manual entry" : "Units + live market price"} />
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Your funds</p>
              <div className="space-y-1.5">
                {funds.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className="h-2 w-2 rounded-full shrink-0" style={{ background: f.color }} />
                    <span className="font-semibold w-16">{f.ticker}</span>
                    <span className="flex-1 text-muted-foreground truncate">{f.name}</span>
                    <span>{f.targetPct}% target · ±{f.rangeLow} band{f.hardCap ? ` · cap ${f.hardCap}%` : ""}{f.floor ? ` · floor ${f.floor}%` : ""}</span>
                  </div>
                ))}
              </div>
            </div>
            {combinedEnabled && <SummaryRow label="Combined ceiling" value={`${combinedTickers.join(" + ")} under ${combinedHard}%`} />}
            {drawdownEnabled && <SummaryRow label="Drawdown trigger" value={`${drawdownTriggerPct}% down from peak`} />}
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 px-3 py-2.5 text-xs text-red-600 dark:text-red-400">
            {error}
          </div>
        )}

        <div className="flex items-center justify-between mt-6 pt-5 border-t border-border">
          <button type="button" onClick={back} disabled={step === 0} className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground disabled:opacity-30">
            <ChevronLeft className="h-4 w-4" /> Back
          </button>
          {step < STEPS.length - 1 ? (
            <button type="button" onClick={next} className="flex items-center gap-1 rounded-lg btn-brand px-4 py-2 text-sm font-semibold">
              Next <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button type="button" onClick={submit} disabled={isPending} className="flex items-center gap-2 rounded-lg btn-brand px-4 py-2 text-sm font-semibold disabled:opacity-60">
              {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {isPending ? "Creating your plan…" : "Create my plan"}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-muted-foreground mb-1.5">{label}</label>
      {children}
    </div>
  )
}

function MiniField({ label, value, onChange }: { label: string; value: number | string; onChange: (v: number) => void }) {
  return (
    <div>
      <label className="block text-[10px] text-muted-foreground mb-1">{label}</label>
      <input type="number" className="input-field" value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  )
}

function ModeButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={`flex-1 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${active ? "border-primary bg-accent text-foreground" : "border-border text-muted-foreground hover:text-foreground"}`}>
      {children}
    </button>
  )
}

function ModeCard({ active, disabled, onClick, title, desc }: { active?: boolean; disabled?: boolean; onClick?: () => void; title: string; desc: string }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} className={`w-full text-left rounded-lg border p-3 transition-colors ${
      disabled ? "border-border opacity-50 cursor-not-allowed" : active ? "border-primary bg-accent" : "border-border hover:border-primary/40"
    }`}>
      <p className="text-xs font-semibold">{title}</p>
      <p className="text-[11px] text-muted-foreground mt-0.5">{desc}</p>
    </button>
  )
}

function SummaryRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs font-semibold">{value}</span>
    </div>
  )
}
