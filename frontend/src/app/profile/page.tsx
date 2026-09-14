"use client";

import Image from "next/image";
import { type ChangeEvent, useState } from "react";
import { Camera, KeyRound, Loader2, ShieldCheck, ShieldOff, Trash2, UserRound } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getAuthToken } from "@/lib/auth-token";
import { useI18n } from "@/lib/i18n";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080/api";

type TwoFactorSetup = {
  secret: string;
  otpauth_url: string;
  qr_data_url: string;
};

export default function ProfilePage() {
  const { t } = useI18n();
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarSaving, setAvatarSaving] = useState(false);
  const [avatarMessage, setAvatarMessage] = useState("");
  const [avatarError, setAvatarError] = useState("");
  const [twoFactorSetup, setTwoFactorSetup] = useState<TwoFactorSetup | null>(null);
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [disableTwoFactorCode, setDisableTwoFactorCode] = useState("");
  const [twoFactorSaving, setTwoFactorSaving] = useState(false);
  const [twoFactorMessage, setTwoFactorMessage] = useState("");
  const [twoFactorError, setTwoFactorError] = useState("");

  return (
    <AppShell title="Profile">
      {({ user, team, updateUser }) => {
        const initial = user.name.trim().charAt(0).toUpperCase() || "U";
        const currentAvatar = avatarPreview ?? user.avatar_url ?? "";

        function chooseAvatar(event: ChangeEvent<HTMLInputElement>) {
          const file = event.target.files?.[0];
          event.target.value = "";
          setAvatarMessage("");
          setAvatarError("");
          if (!file) {
            return;
          }
          if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.type)) {
            setAvatarError("Use PNG, JPG, WebP, or GIF.");
            return;
          }
          if (file.size > 2 * 1024 * 1024) {
            setAvatarError("Image must be under 2 MB.");
            return;
          }

          const reader = new FileReader();
          reader.onload = () => {
            if (typeof reader.result === "string") {
              setAvatarPreview(reader.result);
            }
          };
          reader.onerror = () => setAvatarError("Could not read image.");
          reader.readAsDataURL(file);
        }

        async function saveAvatar() {
          if (!avatarPreview || avatarPreview === user.avatar_url) {
            return;
          }
          await updateAvatar({ avatar_url: avatarPreview });
        }

        async function clearAvatar() {
          await updateAvatar({ clear: true });
        }

        async function updateAvatar(payload: { avatar_url?: string; clear?: boolean }) {
          const token = getAuthToken();
          if (!token) {
            setAvatarError("Session expired. Please log in again.");
            return;
          }
          setAvatarSaving(true);
          setAvatarError("");
          setAvatarMessage("");
          try {
            const response = await fetch(`${API_URL}/profile/avatar`, {
              method: "PATCH",
              headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify(payload),
            });
            if (!response.ok) {
              const error = await response.json().catch(() => ({ message: response.statusText }));
              throw new Error(error.message ?? "Could not update photo");
            }
            const updatedUser = await response.json();
            updateUser(updatedUser);
            setAvatarPreview(updatedUser.avatar_url ?? null);
            setAvatarMessage(payload.clear ? t("profile.photoRemoved") : t("profile.photoSaved"));
          } catch (requestError) {
            setAvatarError(requestError instanceof Error ? requestError.message : "Could not update photo");
          } finally {
            setAvatarSaving(false);
          }
        }

        async function startTwoFactorSetup() {
          const token = getAuthToken();
          if (!token) {
            setTwoFactorError("Session expired. Please log in again.");
            return;
          }
          setTwoFactorSaving(true);
          setTwoFactorError("");
          setTwoFactorMessage("");
          try {
            const response = await fetch(`${API_URL}/profile/2fa/setup`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
                Authorization: `Bearer ${token}`,
              },
            });
            if (!response.ok) {
              const error = await response.json().catch(() => ({ message: response.statusText }));
              throw new Error(error.message ?? "Could not start two-factor setup");
            }
            setTwoFactorSetup(await response.json());
            setTwoFactorCode("");
            setTwoFactorMessage("Add this setup key to Google Authenticator, then enter the code.");
          } catch (requestError) {
            setTwoFactorError(requestError instanceof Error ? requestError.message : "Could not start two-factor setup");
          } finally {
            setTwoFactorSaving(false);
          }
        }

        async function enableTwoFactor() {
          await updateTwoFactor("/profile/2fa/enable", { code: twoFactorCode }, "Two-factor authentication enabled.");
        }

        async function disableTwoFactor() {
          await updateTwoFactor("/profile/2fa/disable", { code: disableTwoFactorCode }, "Two-factor authentication disabled.");
        }

        async function updateTwoFactor(path: string, payload: { code: string }, successMessage: string) {
          const token = getAuthToken();
          if (!token) {
            setTwoFactorError("Session expired. Please log in again.");
            return;
          }
          setTwoFactorSaving(true);
          setTwoFactorError("");
          setTwoFactorMessage("");
          try {
            const response = await fetch(`${API_URL}${path}`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify(payload),
            });
            if (!response.ok) {
              const error = await response.json().catch(() => ({ message: response.statusText }));
              throw new Error(error.message ?? "Could not update two-factor authentication");
            }
            const updatedUser = await response.json();
            updateUser(updatedUser);
            setTwoFactorSetup(null);
            setTwoFactorCode("");
            setDisableTwoFactorCode("");
            setTwoFactorMessage(successMessage);
          } catch (requestError) {
            setTwoFactorError(requestError instanceof Error ? requestError.message : "Could not update two-factor authentication");
          } finally {
            setTwoFactorSaving(false);
          }
        }

        return (
          <div className="mx-auto max-w-5xl space-y-5">
            <div className="border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
              <div className="flex flex-wrap items-center gap-4">
                <div className="relative flex size-20 items-center justify-center overflow-hidden rounded-full bg-neutral-950 text-2xl font-semibold text-white dark:bg-neutral-100 dark:text-neutral-950">
                  {currentAvatar ? (
                    <span
                      aria-label={`${user.name} photo`}
                      className="absolute inset-0 bg-cover bg-center"
                      role="img"
                      style={{ backgroundImage: `url(${currentAvatar})` }}
                    />
                  ) : (
                    initial
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h1 className="truncate text-2xl font-semibold tracking-normal">{user.name}</h1>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-neutral-500 dark:text-neutral-400">
                    <span>ID {user.id}</span>
                    <span>{user.email}</span>
                    <Badge className="border-neutral-200 bg-neutral-100 text-neutral-700 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-200">
                      {user.role}
                    </Badge>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="sr-only"
                    id="profile-avatar"
                    onChange={chooseAvatar}
                    type="file"
                  />
                  <label
                    className="inline-flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-2.5 text-sm font-medium transition-colors hover:bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-950 dark:hover:bg-neutral-900"
                    htmlFor="profile-avatar"
                  >
                    <Camera className="h-4 w-4" />
                    {t("profile.choosePhoto")}
                  </label>
                  <Button disabled={avatarSaving || !avatarPreview || avatarPreview === user.avatar_url} onClick={saveAvatar}>
                    {avatarSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                    Save
                  </Button>
                  {user.avatar_url ? (
                    <Button disabled={avatarSaving} onClick={clearAvatar} variant="destructive">
                      <Trash2 className="h-4 w-4" />
                      Remove
                    </Button>
                  ) : null}
                </div>
              </div>
              {avatarError ? <p className="mt-3 text-sm text-red-600 dark:text-red-400">{avatarError}</p> : null}
              {avatarMessage ? <p className="mt-3 text-sm text-neutral-500 dark:text-neutral-400">{avatarMessage}</p> : null}
            </div>

            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
              <section className="border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
                <div className="mb-5 flex items-center gap-2">
                  <UserRound className="h-5 w-5 text-neutral-500" />
                  <h2 className="text-lg font-semibold tracking-normal">{t("profile.account")}</h2>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="profile-name">Name</Label>
                    <Input id="profile-name" readOnly value={user.name} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="profile-email">Email</Label>
                    <Input id="profile-email" readOnly value={user.email} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="profile-team">Workspace</Label>
                    <Input id="profile-team" readOnly value={team?.name ?? "TrafficOne"} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="profile-role">Role</Label>
                    <Input id="profile-role" readOnly value={user.role} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="profile-2fa">2FA</Label>
                    <Input id="profile-2fa" readOnly value={user.two_factor_enabled ? t("common.enabled") : t("common.disabled")} />
                  </div>
                </div>
              </section>

              <div className="space-y-5">
                <section className="border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
                  <h2 className="text-lg font-semibold tracking-normal">{t("profile.security")}</h2>
                  <div className="mt-5 space-y-4">
                    <div className="rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 text-neutral-500">
                          {user.two_factor_enabled ? <ShieldCheck className="h-5 w-5" /> : <ShieldOff className="h-5 w-5" />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-sm font-semibold">{t("profile.googleAuthenticator")}</h3>
                            <Badge className="border-neutral-200 bg-neutral-100 text-neutral-700 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-200">
                              {user.two_factor_enabled ? t("common.enabled") : t("common.disabled")}
                            </Badge>
                          </div>
                          <p className="mt-1 text-xs leading-5 text-neutral-500 dark:text-neutral-400">
                            {t("profile.protectLogin")}
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 space-y-3">
                        {!user.two_factor_enabled ? (
                          <>
                            <Button disabled={twoFactorSaving} onClick={startTwoFactorSetup} variant="outline">
                              {twoFactorSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                              {t("profile.startSetup")}
                            </Button>
                            {twoFactorSetup ? (
                              <div className="space-y-3 rounded-md bg-neutral-50 p-3 dark:bg-neutral-950">
                                {twoFactorSetup.qr_data_url ? (
                                  <div className="flex justify-center">
                                    <div className="rounded-md border border-neutral-200 bg-white p-3 shadow-sm dark:border-neutral-800">
                                      <Image
                                        alt="Google Authenticator QR code"
                                        className="size-44"
                                        height={176}
                                        src={twoFactorSetup.qr_data_url}
                                        unoptimized
                                        width={176}
                                      />
                                    </div>
                                  </div>
                                ) : null}
                                <div className="space-y-1">
                                  <Label htmlFor="two-factor-secret">{t("profile.setupKey")}</Label>
                                  <Input id="two-factor-secret" readOnly value={twoFactorSetup.secret} />
                                </div>
                                <a className="inline-flex text-sm font-medium text-blue-600 hover:underline dark:text-blue-400" href={twoFactorSetup.otpauth_url}>
                                  {t("profile.openAuthenticator")}
                                </a>
                                <div className="space-y-1">
                                  <Label htmlFor="two-factor-code">{t("profile.verificationCode")}</Label>
                                  <Input
                                    id="two-factor-code"
                                    inputMode="numeric"
                                    maxLength={6}
                                    onChange={(event) => setTwoFactorCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                                    placeholder="000000"
                                    value={twoFactorCode}
                                  />
                                </div>
                                <Button disabled={twoFactorSaving || twoFactorCode.length !== 6} onClick={enableTwoFactor}>
                                  {twoFactorSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                                  {t("profile.enable2fa")}
                                </Button>
                              </div>
                            ) : null}
                          </>
                        ) : (
                          <div className="space-y-3">
                            <div className="space-y-1">
                              <Label htmlFor="disable-two-factor-code">{t("profile.currentCode")}</Label>
                              <Input
                                id="disable-two-factor-code"
                                inputMode="numeric"
                                maxLength={6}
                                onChange={(event) => setDisableTwoFactorCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                                placeholder="000000"
                                value={disableTwoFactorCode}
                              />
                            </div>
                            <Button disabled={twoFactorSaving || disableTwoFactorCode.length !== 6} onClick={disableTwoFactor} variant="destructive">
                              {twoFactorSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldOff className="h-4 w-4" />}
                              {t("profile.disable2fa")}
                            </Button>
                          </div>
                        )}
                        {twoFactorError ? <p className="text-sm text-red-600 dark:text-red-400">{twoFactorError}</p> : null}
                        {twoFactorMessage ? <p className="text-sm text-neutral-500 dark:text-neutral-400">{twoFactorMessage}</p> : null}
                      </div>
                    </div>
                  </div>
                </section>

              </div>
            </div>
          </div>
        );
      }}
    </AppShell>
  );
}
