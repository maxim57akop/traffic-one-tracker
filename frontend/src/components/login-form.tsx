"use client"

import Image from "next/image"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { cn } from "cn"

import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { setAuthToken } from "@/lib/auth-token"
import { useI18n } from "@/lib/i18n"

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080/api"

export function LoginForm({
  className,
  onAuthenticated,
  ...props
}: React.ComponentProps<"form"> & {
  onAuthenticated?: (token: string) => void
}) {
  const router = useRouter()
  const { t } = useI18n()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [twoFactorCode, setTwoFactorCode] = useState("")
  const [requiresTwoFactor, setRequiresTwoFactor] = useState(false)
  const [message, setMessage] = useState("")
  const [loading, setLoading] = useState(false)

  async function login() {
    if (loading) {
      return
    }

    setLoading(true)
    setMessage("")

    try {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          email,
          password,
          ...(requiresTwoFactor || twoFactorCode ? { two_factor_code: twoFactorCode } : {}),
        }),
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({
          message: t("login.failed"),
        }))
        throw new Error(error.message ?? t("login.failed"))
      }

      const data = await response.json()
      if (data.requires_2fa) {
        setRequiresTwoFactor(true)
        setMessage("Enter the 6-digit code from Google Authenticator.")
        return
      }
      setAuthToken(data.token)
      onAuthenticated?.(data.token)
      router.replace("/dashboard")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("login.failed"))
    } finally {
      setLoading(false)
    }
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void login()
  }

  return (
    <form className={cn("flex flex-col gap-7", className)} onSubmit={submit} {...props}>
      <FieldGroup>
        <div className="flex flex-col items-center gap-4 text-center">
          <Image
            src="/logo.jpg"
            alt="TrafficOne"
            width={88}
            height={88}
            priority
            className="size-22 rounded-md bg-black object-cover"
          />
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-normal">
              {t("login.title")}
            </h1>
            <p className="text-balance text-sm text-muted-foreground">
              {t("login.subtitle")}
            </p>
          </div>
        </div>

        <Field>
          <FieldLabel htmlFor="email">{t("login.email")}</FieldLabel>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value)
              setRequiresTwoFactor(false)
              setTwoFactorCode("")
            }}
            autoComplete="email"
            required
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="password">{t("login.password")}</FieldLabel>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value)
              setRequiresTwoFactor(false)
              setTwoFactorCode("")
            }}
            autoComplete="current-password"
            required
            minLength={8}
          />
        </Field>
        {requiresTwoFactor && (
          <Field>
            <FieldLabel htmlFor="two-factor-code">Google Authenticator code</FieldLabel>
            <Input
              id="two-factor-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={twoFactorCode}
              onChange={(event) => setTwoFactorCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              required
              minLength={6}
              maxLength={6}
            />
          </Field>
        )}
        <Field>
          <Button type="button" onClick={login} disabled={loading}>
            {loading ? t("actions.signingIn") : t("actions.login")}
          </Button>
          {message && (
            <FieldDescription className="text-center text-destructive">
              {message}
            </FieldDescription>
          )}
        </Field>
      </FieldGroup>
    </form>
  )
}
