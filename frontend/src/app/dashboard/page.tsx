"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Settings } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { getAuthToken } from "@/lib/auth-token";
import { useI18n } from "@/lib/i18n";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080/api";

type DashboardMetrics = {
  clicks: number;
  unique_campaign: number;
  conversions: number;
  cost: number;
  revenue_confirmed: number;
  profit_loss_confirmed: number;
  roi_confirmed: number;
};

type DashboardHour = {
  hour: string;
  clicks: number;
  unique_campaign: number;
  conversions: number;
  cost: number;
  revenue: number;
  profit_loss: number;
  roi: number;
};

type DashboardTableRow = {
  id: string;
  name: string;
  clicks: number;
  unique_campaign: number;
  conversions: number;
  cost: number;
};

type DashboardTable = {
  key: string;
  title: string;
  rows: DashboardTableRow[];
  total: DashboardTableRow;
};

type DashboardPayload = {
  metrics: DashboardMetrics;
  hourly: DashboardHour[];
  tables: DashboardTable[];
};

const emptyDashboard: DashboardPayload = {
  metrics: {
    clicks: 0,
    unique_campaign: 0,
    conversions: 0,
    cost: 0,
    revenue_confirmed: 0,
    profit_loss_confirmed: 0,
    roi_confirmed: 0,
  },
  hourly: Array.from({ length: 24 }, (_, hour) => ({
    hour: `${String(hour).padStart(2, "0")}:00`,
    clicks: 0,
    unique_campaign: 0,
    conversions: 0,
    cost: 0,
    revenue: 0,
    profit_loss: 0,
    roi: 0,
  })),
  tables: [
    { key: "campaign", title: "Campaign", rows: [], total: emptyRow() },
    { key: "landing", title: "Landing page", rows: [], total: emptyRow() },
    { key: "offer", title: "Offer", rows: [], total: emptyRow() },
    { key: "source", title: "Source", rows: [], total: emptyRow() },
  ],
};

const metricColors = {
  clicks: "#4586e8",
  unique: "#9552ed",
  conversions: "#f54c80",
  cost: "#f3c800",
  revenue: "#fb6600",
  profit: "#1dbdb7",
  roi: "#28aad1",
};

const legend = [
  { label: "Clicks", color: metricColors.clicks },
  { label: "UC (campaign)", color: metricColors.unique },
  { label: "Conv.", color: metricColors.conversions },
  { label: "Cost", color: metricColors.cost },
  { label: "Revenue (confirmed)", color: metricColors.revenue },
  { label: "Profit/Loss (confirmed)", color: metricColors.profit },
  { label: "ROI (confirmed)", color: metricColors.roi },
];

async function apiRequest<T>(path: string, options: RequestInit = {}) {
  const token = getAuthToken();
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(error.message ?? "Request failed");
  }

  return response.json() as Promise<T>;
}

export default function DashboardPage() {
  return (
    <AppShell title="Dashboard">
      {() => <DashboardContent />}
    </AppShell>
  );
}

function DashboardContent() {
  const { t } = useI18n();
  const [data, setData] = useState<DashboardPayload>(emptyDashboard);
  const [dateFilter, setDateFilter] = useState("today");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const metrics = useMemo(
    () => [
      { label: t("landing.clicks"), value: formatNumber(data.metrics.clicks), color: metricColors.clicks },
      { label: "UC (campaign)", value: formatNumber(data.metrics.unique_campaign), color: metricColors.unique },
      { label: "Conv.", value: formatNumber(data.metrics.conversions), color: metricColors.conversions },
      { label: "Cost", value: formatMoney(data.metrics.cost, 4), color: metricColors.cost },
      {
        label: "Revenue (confirmed)",
        value: formatMoney(data.metrics.revenue_confirmed),
        color: metricColors.revenue,
      },
      {
        label: "Profit/Loss (confirmed)",
        value: formatMoney(data.metrics.profit_loss_confirmed),
        color: metricColors.profit,
      },
      { label: "ROI (confirmed)", value: `${formatNumber(data.metrics.roi_confirmed, 2)}%`, color: metricColors.roi },
    ],
    [data.metrics, t],
  );

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const payload = await apiRequest<DashboardPayload>(`/dashboard?date=${dateFilter}`);
      setData(normalizeDashboard(payload));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not load dashboard");
      setData(emptyDashboard);
    } finally {
      setLoading(false);
    }
  }, [dateFilter]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadDashboard();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadDashboard]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold tracking-normal">{t("menu.dashboard")}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Select className="h-9 w-48 bg-white dark:bg-neutral-900" defaultValue="campaigns">
            <option value="campaigns">{t("menu.campaigns")}</option>
            <option value="landing-pages">{t("menu.landingPages")}</option>
            <option value="offers">{t("menu.offers")}</option>
          </Select>
          <Select
            className="h-9 w-40 bg-white dark:bg-neutral-900"
            value={dateFilter}
            onChange={(event) => setDateFilter(event.target.value)}
          >
            <option value="today">{t("common.today")}</option>
            <option value="yesterday">{t("common.yesterday")}</option>
            <option value="last7">{t("common.last7Days")}</option>
            <option value="all">{t("common.allTime")}</option>
          </Select>
          <Button
            variant="outline"
            size="icon-lg"
            className="rounded-md"
            onClick={() => void loadDashboard()}
            title={t("actions.refresh")}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button variant="outline" size="icon-lg" className="rounded-md" title="Dashboard settings">
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {error ? (
        <div className="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      ) : null}

      <section className="grid grid-cols-2 gap-1 md:grid-cols-4 xl:grid-cols-7">
        {metrics.map((metric) => (
          <div
            key={metric.label}
            className="overflow-hidden rounded-md text-center text-white"
            style={{ backgroundColor: metric.color }}
          >
            <div className="bg-black/10 px-3 py-2 text-sm font-semibold">{metric.label}</div>
            <div className="px-3 py-4 text-xl font-bold">{metric.value}</div>
          </div>
        ))}
      </section>

      <section className="border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <DashboardChart hourly={data.hourly} />
        <div className="mt-3 flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm">
          {legend.map((item) => (
            <div key={item.label} className="flex items-center gap-2">
              <span className="size-3 rounded-sm" style={{ backgroundColor: item.color }} />
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        {data.tables.map((table) => (
          <SummaryTable key={table.key} table={table} />
        ))}
      </section>
    </div>
  );
}

function DashboardChart({ hourly }: { hourly: DashboardHour[] }) {
  const width = 1200;
  const height = 260;
  const padLeft = 56;
  const padRight = 44;
  const padTop = 10;
  const padBottom = 36;
  const plotWidth = width - padLeft - padRight;
  const plotHeight = height - padTop - padBottom;
  const maxValue = Math.max(
    1,
    ...hourly.flatMap((item) => [
      item.clicks,
      item.unique_campaign,
      item.conversions,
      item.cost,
      item.revenue,
      Math.abs(item.profit_loss),
      Math.abs(item.roi),
    ]),
  );

  const x = (index: number) => padLeft + (index / Math.max(hourly.length - 1, 1)) * plotWidth;
  const y = (value: number) => padTop + plotHeight - (Math.max(value, 0) / maxValue) * plotHeight;
  const points = (key: keyof Pick<DashboardHour, "clicks" | "unique_campaign" | "conversions" | "cost">) =>
    hourly.map((item, index) => `${x(index)},${y(Number(item[key]) || 0)}`).join(" ");
  const areaPath = `M ${x(0)} ${y(hourly[0]?.clicks ?? 0)} ${hourly
    .map((item, index) => `L ${x(index)} ${y(item.clicks)}`)
    .join(" ")} L ${x(hourly.length - 1)} ${y(0)} L ${x(0)} ${y(0)} Z`;

  return (
    <div className="w-full overflow-x-auto">
      <svg className="min-w-[980px]" viewBox={`0 0 ${width} ${height}`} role="img">
        {Array.from({ length: 6 }).map((_, index) => {
          const value = (maxValue / 5) * index;
          return (
            <g key={index}>
              <line
                stroke="#d8d8d8"
                strokeWidth="1"
                x1={padLeft}
                x2={width - padRight}
                y1={y(value)}
                y2={y(value)}
              />
              <text fill="#6b7280" fontSize="12" textAnchor="end" x={padLeft - 10} y={y(value) + 4}>
                {formatAxisValue(value)}
              </text>
            </g>
          );
        })}

        {hourly.map((item, index) => (
          <g key={item.hour}>
            <line
              stroke="#e5e7eb"
              strokeWidth="1"
              x1={x(index)}
              x2={x(index)}
              y1={padTop}
              y2={height - padBottom}
            />
            <text fill="#6b7280" fontSize="12" textAnchor="middle" x={x(index)} y={height - 12}>
              {item.hour}
            </text>
          </g>
        ))}

        <text fill="#6b7280" fontSize="13" textAnchor="middle" transform="rotate(-90 16 132)" x="16" y="132">
          Volume or %
        </text>
        <text fill="#6b7280" fontSize="13" textAnchor="middle" transform="rotate(90 1182 132)" x="1182" y="132">
          EUR
        </text>

        <path d={areaPath} fill={metricColors.clicks} opacity="0.22" />
        <polyline fill="none" points={points("clicks")} stroke={metricColors.clicks} strokeWidth="3" />
        <polyline fill="none" points={points("unique_campaign")} stroke={metricColors.unique} strokeWidth="3" />
        <polyline fill="none" points={points("conversions")} stroke={metricColors.conversions} strokeWidth="3" />
        <polyline fill="none" points={points("cost")} stroke={metricColors.cost} strokeWidth="2" />

        {hourly.map((item, index) => (
          <g key={`${item.hour}-dots`}>
            <circle cx={x(index)} cy={y(item.clicks)} fill={metricColors.clicks} r="4" stroke="white" strokeWidth="1.5" />
            <circle
              cx={x(index)}
              cy={y(item.unique_campaign)}
              fill={metricColors.unique}
              r="4"
              stroke="white"
              strokeWidth="1.5"
            />
            <circle
              cx={x(index)}
              cy={y(item.conversions)}
              fill={metricColors.conversions}
              r="3.5"
              stroke="white"
              strokeWidth="1.5"
            />
            <circle cx={x(index)} cy={y(item.cost)} fill={metricColors.cost} r="3.5" stroke="white" strokeWidth="1.5" />
          </g>
        ))}
      </svg>
    </div>
  );
}

function SummaryTable({ table }: { table: DashboardTable }) {
  return (
    <div className="overflow-hidden border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <table className="w-full border-collapse text-left text-sm">
        <thead className="bg-neutral-50 text-neutral-500 dark:bg-neutral-950 dark:text-neutral-400">
          <tr>
            <th className="h-10 border-b border-neutral-200 px-3 font-medium dark:border-neutral-800">{table.title}</th>
            <th className="h-10 w-24 border-b border-t-4 border-t-neutral-300 px-3 font-medium dark:border-neutral-800 dark:border-t-neutral-700">
              Clicks
            </th>
            <th className="h-10 w-36 border-b border-neutral-200 px-3 font-medium dark:border-neutral-800">
              UC (campaign)
            </th>
            <th className="h-10 w-24 border-b border-neutral-200 px-3 font-medium dark:border-neutral-800">
              Conv.
            </th>
          </tr>
        </thead>
        <tbody>
          {table.rows.length === 0 ? (
            <tr className="border-b border-neutral-100 dark:border-neutral-800">
              <td className="h-10 px-3 text-neutral-500" colSpan={4}>
                No data yet
              </td>
            </tr>
          ) : (
            table.rows.map((row) => (
              <tr key={`${table.key}-${row.id}`} className="border-b border-neutral-100 dark:border-neutral-800">
                <td className="h-10 max-w-[280px] truncate px-3 font-medium">{row.name}</td>
                <td className="h-10 px-3">{formatNumber(row.clicks)}</td>
                <td className="h-10 px-3">{formatNumber(row.unique_campaign)}</td>
                <td className="h-10 px-3">{formatNumber(row.conversions)}</td>
              </tr>
            ))
          )}
          <tr className="bg-neutral-50 text-neutral-600 dark:bg-neutral-950 dark:text-neutral-300">
            <td className="h-10 px-3" />
            <td className="h-10 px-3">{formatNumber(table.total?.clicks ?? 0)}</td>
            <td className="h-10 px-3">{formatNumber(table.total?.unique_campaign ?? 0)}</td>
            <td className="h-10 px-3">{formatNumber(table.total?.conversions ?? 0)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function normalizeDashboard(payload: DashboardPayload): DashboardPayload {
  const byHour = new Map((payload.hourly ?? []).map((item) => [item.hour, item]));
  return {
    metrics: { ...emptyDashboard.metrics, ...(payload.metrics ?? {}) },
    hourly: emptyDashboard.hourly.map((hour) => ({ ...hour, ...(byHour.get(hour.hour) ?? {}) })),
    tables: (payload.tables?.length ? payload.tables : emptyDashboard.tables).map((table) => ({
      ...table,
      rows: table.rows ?? [],
      total: table.total ?? emptyRow(),
    })),
  };
}

function emptyRow(): DashboardTableRow {
  return {
    id: "",
    name: "",
    clicks: 0,
    unique_campaign: 0,
    conversions: 0,
    cost: 0,
  };
}

function formatMoney(value: number, digits = 2) {
  return `€${formatNumber(value, digits)}`;
}

function formatNumber(value: number, digits = 0) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Number.isFinite(value) ? value : 0);
}

function formatAxisValue(value: number) {
  if (value >= 10) {
    return formatNumber(value, 0);
  }
  if (value >= 1) {
    return formatNumber(value, 1);
  }
  return formatNumber(value, 2);
}
