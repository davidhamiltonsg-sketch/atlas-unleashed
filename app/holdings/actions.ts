"use server"

import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { getSession } from "@/lib/session"
import { getQuotes } from "@/lib/market-data"

/** Manual-value mode: the user types in a new current value for one fund. */
export async function updateHoldingValueAction(holdingId: string, value: number) {
  const session = await getSession()
  if (!session) return { error: "Not signed in." }
  if (value < 0) return { error: "Value can't be negative." }

  const holding = await db.holding.findUnique({ where: { id: holdingId } })
  if (!holding || holding.userId !== session.userId) return { error: "Not found." }

  await db.snapshot.create({ data: { holdingId, units: holding.units, price: 0, value } })
  revalidatePath("/")
  return { success: true }
}

/**
 * Units-market mode: re-fetch a live quote per ticker and record a fresh
 * snapshot (units unchanged, value = units × price). A ticker that fails to
 * resolve is skipped for this refresh — its last known value stays as-is
 * rather than being zeroed out.
 */
export async function refreshMarketPricesAction() {
  const session = await getSession()
  if (!session) return { error: "Not signed in." }

  const holdings = await db.holding.findMany({ where: { userId: session.userId } })
  if (holdings.length === 0) return { success: true, updated: 0 }

  const quotes = await getQuotes(holdings.map((h) => h.ticker))
  let updated = 0
  for (const h of holdings) {
    const quote = quotes[h.ticker]
    if (!quote || quote.price === null) continue
    await db.snapshot.create({ data: { holdingId: h.id, units: h.units, price: quote.price, value: h.units * quote.price } })
    updated++
  }
  revalidatePath("/")
  return { success: true, updated, total: holdings.length }
}
