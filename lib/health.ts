// ─────────────────────────────────────────────────────────────────────────────
// Atlas Unleashed — portfolio health scorecard.
//
// Four dimensions, each 0–100, weighted into one overall score. Same penalty-
// formula shape as atlas-core's lib/health.ts, simplified to a generic v1 with
// no bespoke categories to match (there's no second hardcoded portfolio here to
// stay consistent with) — this is intentionally simpler than either of
// atlas-core's two scorecards.
// ─────────────────────────────────────────────────────────────────────────────

export interface DimensionScore {
  score: number
  label: string
  description: string
  status: "excellent" | "good" | "caution" | "critical"
}

export interface PortfolioHealth {
  overall: number
  overallLabel: string
  allocation: DimensionScore
  compliance: DimensionScore
  freshness: DimensionScore
  contribution: DimensionScore
}

function dimStatus(score: number): DimensionScore["status"] {
  if (score >= 90) return "excellent"
  if (score >= 75) return "good"
  if (score >= 55) return "caution"
  return "critical"
}

export function computePortfolioHealth({
  hardBreaches,
  floorBreaches,
  softBreaches,
  maxDrift,
  snapshotAgeDays,
  monthlyContribution,
}: {
  hardBreaches: number
  floorBreaches: number
  softBreaches: number
  maxDrift: number
  snapshotAgeDays: number
  monthlyContribution: number
}): PortfolioHealth {
  // Allocation (40%): every fund inside the range the user set for it.
  const allocation = Math.max(0, Math.round(
    100 - hardBreaches * 20 - floorBreaches * 20 - softBreaches * 8 - maxDrift * 1.2
  ))

  // Compliance (25%): are any of the user's own hard rules currently breached.
  const compliance = Math.max(0, Math.round(100 - (hardBreaches + floorBreaches) * 30))

  // Freshness (20%): how current the last value update is.
  const freshness =
    snapshotAgeDays <= 3  ? 100 :
    snapshotAgeDays <= 7  ? 95  :
    snapshotAgeDays <= 14 ? 85  :
    snapshotAgeDays <= 30 ? 70  :
    snapshotAgeDays <= 60 ? 45  : 20

  // Contribution (15%): a monthly contribution set up, and data kept current
  // enough to trust it's actually happening (a proxy, not a payment log).
  const contribution = monthlyContribution > 0
    ? Math.round(freshness * 0.6 + 40)
    : 30

  const overall = Math.round(
    allocation   * 0.40 +
    compliance   * 0.25 +
    freshness    * 0.20 +
    contribution * 0.15
  )

  const overallLabel =
    overall >= 80 ? "Good standing" :
    overall >= 65 ? "Review recommended" :
    "Action required"

  return {
    overall,
    overallLabel,
    allocation: {
      score: allocation, label: "Allocation", description: "Every fund within the range you set",
      status: dimStatus(allocation),
    },
    compliance: {
      score: compliance, label: "Compliance", description: "No hard rule currently breached",
      status: dimStatus(compliance),
    },
    freshness: {
      score: freshness, label: "Freshness", description: "How current your value data is",
      status: dimStatus(freshness),
    },
    contribution: {
      score: contribution, label: "Contribution", description: "Monthly investing discipline",
      status: dimStatus(contribution),
    },
  }
}
