import { OnboardingWizard } from "@/components/onboarding/wizard"
import { Compass } from "lucide-react"

export default function SignupPage() {
  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <div className="flex flex-col items-center mb-8">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl btn-brand mb-3">
          <Compass className="h-5 w-5" />
        </div>
        <h1 className="text-xl font-semibold tracking-tight">Build your plan</h1>
        <p className="text-xs text-muted-foreground mt-1 max-w-sm text-center">
          This app doesn&apos;t recommend funds, weights, or thresholds — you decide all of it. Once it&apos;s built, this app only checks your portfolio against the rules you set.
        </p>
      </div>
      <OnboardingWizard />
    </div>
  )
}
