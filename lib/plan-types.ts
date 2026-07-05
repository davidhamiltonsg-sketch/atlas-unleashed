// Shared shape between the onboarding wizard (client) and the signup server
// action. Everything here is what the USER typed — nothing is a suggested
// default the wizard picked for them.

export type ValueTrackingMode = "manual" | "units_market"
// "broker" (read-only IBKR sync) is Phase 3 — not offered by the wizard yet.

export interface WizardFund {
  ticker: string
  name: string
  color: string
  targetPct: number
  rangeLow: number
  rangeHigh: number
  hardCap: number | null
  floor: number | null
  /** Manual mode: current $ value. Units-market mode: units held. */
  amount: number
}

export interface WizardData {
  name: string
  email: string
  password: string
  horizonYears: number | null
  targetDate: string | null // ISO date, YYYY-MM-DD
  monthlyContribution: number
  valueTrackingMode: ValueTrackingMode
  funds: WizardFund[]
  combinedGroup: { tickers: [string, string]; hard: number } | null
  drawdownTriggerPct: number | null
}

export const FUND_COLORS = [
  "#059669", "#0891b2", "#7c3aed", "#d97706", "#dc2626", "#4f46e5", "#0d9488", "#c026d3",
]
