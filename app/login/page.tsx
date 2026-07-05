"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { loginAction } from "./actions"
import { Lock, Compass } from "lucide-react"

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      const result = await loginAction(formData)
      if (result?.error) setError(result.error)
    })
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl btn-brand mb-4">
            <Compass className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight">Atlas Unleashed</h1>
          <p className="text-xs text-muted-foreground mt-1">Sign in to your plan</p>
        </div>

        <div className="rounded-2xl card-lux p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Email</label>
              <input type="email" name="email" required autoComplete="email" className="input-field" placeholder="you@example.com" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Password</label>
              <input type="password" name="password" required autoComplete="current-password" className="input-field" placeholder="••••••••" />
            </div>
            {error && (
              <div className="rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 px-3 py-2.5 text-xs text-red-600 dark:text-red-400">
                {error}
              </div>
            )}
            <button type="submit" disabled={isPending} className="w-full flex items-center justify-center gap-2 rounded-lg btn-brand disabled:opacity-60 text-sm font-semibold py-2.5">
              <Lock className="h-3.5 w-3.5" />
              {isPending ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-5">
          New here? <Link href="/signup" className="font-semibold text-foreground hover:underline">Build your plan</Link>
        </p>
      </div>
    </div>
  )
}
