"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { LogOut } from "lucide-react"
import { logoutAction } from "@/app/actions"

const TABS = [
  { href: "/", label: "Compliance" },
  { href: "/risk", label: "Risk" },
  { href: "/rules", label: "Rules" },
  { href: "/constitution", label: "Constitution" },
] as const

export function AppHeader({ userName }: { userName: string }) {
  const pathname = usePathname()

  return (
    <header className="border-b border-border">
      <div className="max-w-4xl mx-auto px-5 pt-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold">Atlas Unleashed</p>
          <p className="text-xs text-muted-foreground">{userName}&apos;s plan</p>
        </div>
        <form action={logoutAction}>
          <button type="submit" className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
            <LogOut className="h-3.5 w-3.5" /> Sign out
          </button>
        </form>
      </div>
      <nav className="max-w-4xl mx-auto px-5 mt-3 flex gap-1">
        {TABS.map((tab) => {
          const active = pathname === tab.href
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`px-3 py-2 text-xs font-semibold border-b-2 transition-colors ${
                active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </Link>
          )
        })}
      </nav>
    </header>
  )
}
