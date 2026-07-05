"use server"

import { revalidatePath } from "next/cache"
import { getSession } from "@/lib/session"
import { db } from "@/lib/db"
import { refreshLookThrough } from "@/lib/look-through"

/** Only ever refreshes look-through for a ticker the signed-in user actually holds in their own plan. */
export async function refreshFundLookThroughAction(ticker: string) {
  const session = await getSession()
  if (!session) return { success: false as const, error: "Not signed in." }

  const owns = await db.constitutionFund.findFirst({
    where: { ticker: ticker.toUpperCase(), constitution: { userId: session.userId } },
  })
  if (!owns) return { success: false as const, error: "That fund isn't in your plan." }

  const result = await refreshLookThrough(ticker)
  if (result.success) revalidatePath("/risk")
  return result
}
