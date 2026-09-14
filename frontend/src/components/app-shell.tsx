"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  BarChart3,
  Bell,
  Blocks,
  ChevronRight,
  FileText,
  Globe2,
  Home,
  Link2,
  LogOut,
  Megaphone,
  Moon,
  Send,
  Settings,
  Share2,
  Sun,
  Users,
  Wrench,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { clearAuthToken, getAuthToken } from "@/lib/auth-token";
import { useI18n } from "@/lib/i18n";
import type { Language, TranslationKey } from "@/lib/i18n";
import { usePageTitle } from "@/lib/page-title";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080/api";
const THEME_KEY = "trafficone_theme";
const SIDEBAR_COLLAPSED_KEY = "trafficone_sidebar_collapsed";

type Theme = "light" | "dark";

type User = {
  id: number;
  name: string;
  email: string;
  role: string;
  avatar_url?: string;
  two_factor_enabled?: boolean;
  team?: Team;
};

type Team = {
  id: number;
  name: string;
  users?: User[];
};

type AppShellContext = {
  user: User;
  team: Team | null;
  updateUser: (user: User) => void;
};

type AppShellProps = {
  title: string;
  children: (context: AppShellContext) => ReactNode;
};

const menu: Array<{
  labelKey: TranslationKey;
  href: string;
  icon: typeof Home;
  hasChildren?: boolean;
  badge?: string;
}> = [
  { labelKey: "menu.dashboard", href: "/dashboard", icon: Home },
  { labelKey: "menu.campaigns", href: "/campaigns", icon: Megaphone },
  { labelKey: "menu.landingPages", href: "/landing-pages", icon: FileText },
  { labelKey: "menu.offers", href: "/offers", icon: Link2 },
  { labelKey: "menu.trafficSources", href: "/traffic-sources", icon: Share2 },
  { labelKey: "menu.reports", href: "/reports", icon: BarChart3 },
  { labelKey: "menu.domains", href: "/domains", icon: Globe2 },
  { labelKey: "menu.users", href: "/users", icon: Users },
  { labelKey: "menu.settings", href: "/settings", icon: Settings, hasChildren: true },
  { labelKey: "menu.maintenance", href: "/maintenance", icon: Wrench, hasChildren: true },
  { labelKey: "menu.integrations", href: "/integrations", icon: Blocks, badge: "soon" },
  { labelKey: "menu.postbacks", href: "/postbacks", icon: Send },
];

export function AppShell({ title, children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { language, setLanguage, t } = useI18n();
  usePageTitle(title);
  const [token, setToken] = useState<string | null>(() => {
    if (typeof window === "undefined") {
      return null;
    }

    return getAuthToken();
  });
  const [user, setUser] = useState<User | null>(null);
  const [team, setTeam] = useState<Team | null>(null);
  const [theme, setTheme] = useState<Theme>("light");
  const [themeReady, setThemeReady] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const api = useCallback(
    async <T,>(path: string, options: RequestInit = {}): Promise<T> => {
      const response = await fetch(`${API_URL}${path}`, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...options.headers,
        },
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: response.statusText }));
        throw new Error(error.message ?? "Request failed");
      }

      return response.json();
    },
    [token],
  );

  const loadWorkspace = useCallback(async () => {
    if (!token) {
      router.replace("/login");
      return;
    }

    try {
      const [me, teamData] = await Promise.all([
        api<User>("/auth/me"),
        api<Team>("/team"),
      ]);

      setUser(me);
      setTeam(teamData);
    } catch {
      clearAuthToken();
      setToken(null);
      setUser(null);
      setTeam(null);
      router.replace("/login");
    }
  }, [api, router, token]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadWorkspace();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadWorkspace]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const storedTheme = window.localStorage.getItem(THEME_KEY);
      if (storedTheme === "dark" || storedTheme === "light") {
        setTheme(storedTheme);
      }

      setSidebarCollapsed(window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true");
      setThemeReady(true);
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    if (themeReady) {
      window.localStorage.setItem(THEME_KEY, theme);
    }
  }, [theme, themeReady]);

  function logout() {
    clearAuthToken();
    setToken(null);
    setUser(null);
    setTeam(null);
    router.replace("/login");
  }

  function toggleTheme() {
    setTheme((currentTheme) => (currentTheme === "dark" ? "light" : "dark"));
    setThemeReady(true);
  }

  function toggleSidebar() {
    setSidebarCollapsed((currentValue) => {
      const nextValue = !currentValue;
      window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(nextValue));
      return nextValue;
    });
  }

  if (!token || !user) {
    return null;
  }

  return (
    <main className="min-h-screen bg-neutral-100 text-neutral-950 dark:bg-neutral-950 dark:text-neutral-50">
      <div
        className={[
          "grid min-h-screen transition-[grid-template-columns] duration-200",
          sidebarCollapsed ? "lg:grid-cols-[84px_1fr]" : "lg:grid-cols-[260px_1fr]",
        ].join(" ")}
      >
        <aside className="relative border-r border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
          <Button
            aria-label={sidebarCollapsed ? t("shell.expandSidebar") : t("shell.collapseSidebar")}
            title={sidebarCollapsed ? t("shell.expandSidebar") : t("shell.collapseSidebar")}
            variant="outline"
            size="icon-sm"
            onClick={toggleSidebar}
            className="absolute -right-4 top-20 z-20 size-8 rounded-full border-neutral-200 bg-white shadow-sm hover:bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-950 dark:hover:bg-neutral-900"
          >
            <ChevronRight className={["h-4 w-4 transition-transform", sidebarCollapsed ? "" : "rotate-180"].join(" ")} />
          </Button>
          <div
            className={[
              "flex h-16 items-center border-b border-neutral-200 dark:border-neutral-800",
              sidebarCollapsed ? "justify-center px-3" : "gap-3 px-5",
            ].join(" ")}
          >
            <Image
              src="/logo.jpg"
              alt="TrafficOne"
              width={34}
              height={34}
              priority
              className="size-8 rounded bg-black object-cover"
            />
            <div className={sidebarCollapsed ? "sr-only" : "min-w-0 flex-1"}>
              <div className="text-sm font-semibold leading-tight">TrafficOne</div>
              <div className="text-xs text-neutral-500 dark:text-neutral-400">
                {team?.name ?? t("shell.workspace")}
              </div>
            </div>
          </div>

          <nav className={["space-y-1 p-3", sidebarCollapsed ? "flex flex-col items-center" : ""].join(" ")}>
            {menu.map((item) => {
              const active = pathname === item.href || (item.href === "/campaigns" && pathname.startsWith("/campaign/"));

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={sidebarCollapsed ? t(item.labelKey) : undefined}
                  className={[
                    "flex h-10 items-center rounded-md text-sm transition-colors",
                    sidebarCollapsed ? "w-10 justify-center px-0" : "w-full gap-3 px-3 text-left",
                    active
                      ? "bg-neutral-950 text-white dark:bg-neutral-100 dark:text-neutral-950"
                      : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-950 dark:text-neutral-400 dark:hover:bg-neutral-900 dark:hover:text-neutral-50",
                  ].join(" ")}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  <span className={sidebarCollapsed ? "sr-only" : "min-w-0 flex-1 truncate"}>{t(item.labelKey)}</span>
                  {item.badge && !sidebarCollapsed && (
                    <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
                      {item.badge}
                    </span>
                  )}
                  {item.hasChildren && !sidebarCollapsed && <ChevronRight className="h-4 w-4 text-neutral-400" />}
                </Link>
              );
            })}
          </nav>
        </aside>

        <section className="flex min-w-0 flex-col">
          <header
            aria-label={`${title} workspace controls`}
            className="flex h-16 items-center justify-end border-b border-neutral-200 bg-white px-5 dark:border-neutral-800 dark:bg-neutral-950"
          >
            <div className="flex items-center gap-2">
              <Select
                aria-label={t("shell.language")}
                className="hidden h-8 w-16 rounded-md bg-white px-2 text-xs font-semibold uppercase dark:bg-neutral-900 sm:block"
                value={language}
                onChange={(event) => setLanguage(event.target.value as Language)}
              >
                <option value="en">EN</option>
                <option value="ru">RU</option>
                <option value="uk">UA</option>
              </Select>
              <Link
                href="/profile"
                className="hidden min-w-0 items-center gap-2 rounded-md px-1.5 py-1 transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-900 sm:flex"
                title="Profile"
              >
                <UserAvatar avatarUrl={user.avatar_url} name={user.name} />
                <div className="hidden min-w-0 items-baseline gap-2 md:flex">
                  <div className="max-w-40 truncate text-sm font-medium leading-none">{user.name}</div>
                  <div className="text-xs leading-none text-neutral-500 dark:text-neutral-400">ID {user.id}</div>
                </div>
                <Badge className="border-neutral-200 bg-neutral-100 text-neutral-700 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-200">
                  {user.role}
                </Badge>
              </Link>
              <Button
                aria-label={t("shell.notifications")}
                title={t("shell.notifications")}
                variant="ghost"
                size="icon-sm"
              >
                <Bell className="h-4 w-4" />
              </Button>
              <Button
                aria-label={theme === "dark" ? t("shell.switchLight") : t("shell.switchDark")}
                title={theme === "dark" ? t("shell.lightTheme") : t("shell.switchDark")}
                variant="ghost"
                size="icon-sm"
                onClick={toggleTheme}
              >
                {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
              <Button variant="ghost" size="sm" onClick={logout}>
                <LogOut className="h-4 w-4" />
                {t("actions.logout")}
              </Button>
            </div>
          </header>

          <div className="flex-1 px-5 py-6">
            {children({ user, team, updateUser: setUser })}
          </div>
        </section>
      </div>
    </main>
  );
}

function UserAvatar({ avatarUrl, name }: { avatarUrl?: string; name: string }) {
  const initial = name.trim().charAt(0).toUpperCase() || "U";

  return (
    <span
      className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-neutral-200 bg-neutral-950 text-xs font-semibold text-white dark:border-neutral-800 dark:bg-neutral-100 dark:text-neutral-950"
      style={avatarUrl ? { backgroundImage: `url(${avatarUrl})`, backgroundPosition: "center", backgroundSize: "cover" } : undefined}
    >
      {!avatarUrl && initial}
    </span>
  );
}

export function SectionPlaceholder({ title }: { title: string }) {
  const { t } = useI18n();
  const titleKey = sectionTitleKeys[title];

  return (
    <div className="border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <div className="max-w-2xl">
        <h1 className="text-xl font-semibold tracking-normal">{titleKey ? t(titleKey) : title}</h1>
        <p className="mt-2 text-sm leading-6 text-neutral-600 dark:text-neutral-400">
          {t("placeholder.description")}
        </p>
      </div>
    </div>
  );
}

const sectionTitleKeys: Record<string, TranslationKey> = {
  "Affiliate Networks": "menu.affiliateNetworks",
  Flows: "menu.flows",
  Integrations: "menu.integrations",
  Maintenance: "menu.maintenance",
  Settings: "menu.settings",
  Streams: "menu.streams",
  Trends: "menu.trends",
};
