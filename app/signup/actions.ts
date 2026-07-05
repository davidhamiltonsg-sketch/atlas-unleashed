"use server"

import { redirect } from "next/navigation"
import bcrypt from "bcryptjs"
import { db } from "@/lib/db"
import { createSession } from "@/lib/session"
import { getQuote } from "@/lib/market-data"
import type { WizardData } from "@/lib/plan-types"

export async function signupAction(data: WizardData): Promise<{ error: string } | never> {
  const email = data.email.trim().toLowerCase()
  const name = data.name.trim()

  if (!email || !name || !data.password) {
    return { error: "Name, email, and password are required." }
  }
  if (data.password.length < 8) {
    return { error: "Password must be at least 8 characters." }
  }
  if (!data.horizonYears && !data.targetDate) {
    return { error: "Set an investment horizon — a number of years or a target date." }
  }
  if (data.funds.length < 2) {
    return { error: "Add at least two funds to your plan." }
  }
  const weightSum = data.funds.reduce((s, f) => s + f.targetPct, 0)
  if (Math.abs(weightSum - 100) > 0.5) {
    return { error: `Your target weights add up to ${weightSum.toFixed(1)}% — they need to sum to 100%.` }
  }

  const existing = await db.user.findUnique({ where: { email } })
  if (existing) {
    return { error: "An account with this email already exists." }
  }

  const passwordHash = await bcrypt.hash(data.password, 12)

  // Units-market mode: resolve a starting price per ticker server-side so the
  // first snapshot has a real value instead of $0. A ticker Finnhub can't
  // resolve just gets a $0 starting snapshot — the dashboard prompts the user
  // to enter a value manually for that fund rather than pretending to know it.
  const quotes = data.valueTrackingMode === "units_market"
    ? await Promise.all(data.funds.map((f) => getQuote(f.ticker)))
    : []
  const quoteByTicker = Object.fromEntries(quotes.map((q) => [q.ticker, q]))

  const user = await db.user.create({
    data: {
      email,
      name,
      passwordHash,
      horizonYears: data.horizonYears,
      targetDate: data.targetDate ? new Date(data.targetDate) : null,
      monthlyContribution: data.monthlyContribution,
      valueTrackingMode: data.valueTrackingMode,
      constitution: {
        create: {
          combinedGroup: data.combinedGroup ? JSON.stringify(data.combinedGroup) : null,
          drawdownTriggerPct: data.drawdownTriggerPct,
          funds: {
            create: data.funds.map((f) => ({
              ticker: f.ticker.toUpperCase(),
              name: f.name,
              color: f.color,
              targetPct: f.targetPct,
              rangeLow: f.rangeLow,
              rangeHigh: f.rangeHigh,
              hardCap: f.hardCap,
              floor: f.floor,
            })),
          },
        },
      },
    },
  })

  for (const f of data.funds) {
    const ticker = f.ticker.toUpperCase()
    let units = 0
    let price = 0
    let value = 0

    if (data.valueTrackingMode === "manual") {
      value = f.amount
    } else {
      units = f.amount
      const quote = quoteByTicker[ticker]
      price = quote?.price ?? 0
      value = price > 0 ? units * price : 0
    }

    const holding = await db.holding.create({
      data: { userId: user.id, ticker, name: f.name, color: f.color, units },
    })
    await db.snapshot.create({
      data: { holdingId: holding.id, units, price, value },
    })
  }

  await createSession({ userId: user.id, email: user.email, name: user.name })
  redirect("/")
}
