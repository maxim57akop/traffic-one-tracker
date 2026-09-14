"use client"

import Image from "next/image"
import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { LoginForm } from "@/components/login-form"
import { Select } from "@/components/ui/select"
import { getAuthToken } from "@/lib/auth-token"
import { useI18n } from "@/lib/i18n"
import type { Language } from "@/lib/i18n"
import { usePageTitle } from "@/lib/page-title"

export default function LoginPage() {
  const router = useRouter()
  const { language, setLanguage, t } = useI18n()
  usePageTitle("Login")

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (getAuthToken()) {
        router.replace("/dashboard")
      }
    }, 0)

    return () => window.clearTimeout(timer)
  }, [router])

  return (
    <div className="grid min-h-svh bg-background lg:grid-cols-2">
      <div className="flex flex-col gap-4 p-6 md:p-10">
        <div className="flex items-center justify-between gap-2">
          <a href="#" className="flex items-center gap-2 font-medium">
            <Image
              src="/logo.jpg"
              alt="TrafficOne"
              width={24}
              height={24}
              priority
              className="size-6 rounded-sm bg-black object-cover"
            />
            TrafficOne
          </a>
          <Select
            aria-label={t("shell.language")}
            className="h-8 w-16 rounded-md bg-white px-2 text-xs font-semibold uppercase"
            value={language}
            onChange={(event) => setLanguage(event.target.value as Language)}
          >
            <option value="en">EN</option>
            <option value="ru">RU</option>
            <option value="uk">UA</option>
          </Select>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-xs">
            <LoginForm />
          </div>
        </div>
      </div>
      <div className="relative hidden overflow-hidden bg-black lg:block">
        <Image
          src="/login-traffic-visual.png"
          alt="TrafficOne analytics network"
          fill
          priority
          sizes="50vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-black/10" />
      </div>
    </div>
  )
}
