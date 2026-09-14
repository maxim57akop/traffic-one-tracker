"use client"

import Image from "next/image"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { LoginForm } from "@/components/login-form"
import { Select } from "@/components/ui/select"
import { getAuthToken } from "@/lib/auth-token"
import { useI18n } from "@/lib/i18n"
import type { Language } from "@/lib/i18n"
import { usePageTitle } from "@/lib/page-title"

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080/api"

export default function LoginPage() {
  const router = useRouter()
  const { language, setLanguage, t } = useI18n()
  const [adminAccessAllowed, setAdminAccessAllowed] = useState<boolean | null>(null)
  usePageTitle("Login")

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetch(`${API_URL}/domain-access`, { headers: { Accept: "application/json" } })
        .then((response) => response.json() as Promise<{ admin_access_allowed?: boolean }>)
        .then((data) => {
          const allowed = data.admin_access_allowed !== false
          setAdminAccessAllowed(allowed)
          if (allowed && getAuthToken()) {
            router.replace("/dashboard")
          }
        })
        .catch(() => {
          setAdminAccessAllowed(true)
          if (getAuthToken()) {
            router.replace("/dashboard")
          }
        })
    }, 0)

    return () => window.clearTimeout(timer)
  }, [router])

  if (adminAccessAllowed === false) {
    return (
      <main className="flex min-h-svh items-center justify-center bg-white p-6 text-neutral-950">
        <div className="max-w-md rounded-md border border-neutral-200 p-6 shadow-sm">
          <h1 className="text-xl font-semibold tracking-normal">Access denied</h1>
          <p className="mt-2 text-sm leading-6 text-neutral-500">
            Admin panel access is disabled for this domain.
          </p>
        </div>
      </main>
    )
  }

  if (adminAccessAllowed === null) {
    return null
  }

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
