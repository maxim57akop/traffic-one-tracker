"use client";

import { AppShell, SectionPlaceholder } from "@/components/app-shell";

export default function SettingsPage() {
  return <AppShell title="Settings">{() => <SectionPlaceholder title="Settings" />}</AppShell>;
}
