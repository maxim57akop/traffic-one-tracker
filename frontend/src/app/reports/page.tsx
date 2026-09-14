"use client";

import * as Flags from "country-flag-icons/react/3x2";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ComponentType } from "react";
import { ChevronDown, GripVertical, RefreshCw, Search, Settings } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { getAuthToken } from "@/lib/auth-token";
import { useI18n } from "@/lib/i18n";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080/api";

type ClickRow = Record<string, string | number | boolean | null | undefined>;

type Column = {
  key: string;
  label: string;
  width?: number;
};

const defaultVisibleColumns = [
  "event_id",
  "subid",
  "date_time",
  "ip",
  "campaign_id",
  "flow_id",
  "landing_page",
  "offer",
  "source",
  "affiliate_network",
  "country_flag",
  "region",
  "city",
  "os_logo",
  "browser_logo",
  "connection_type",
  "device_type",
  "device_model",
  "bot",
  "unique_clicks_campaign",
];

const reportColumns: Column[] = [
  { key: "profitability", label: "Profitability", width: 130 },
  { key: "subid", label: "Subid", width: 170 },
  { key: "date_time", label: "Date and time", width: 190 },
  { key: "ip", label: "IP", width: 150 },
  { key: "campaign_id", label: "Camp. ID", width: 100 },
  { key: "flow_id", label: "Flow ID", width: 100 },
  { key: "landing_page", label: "Landing page", width: 210 },
  { key: "offer", label: "Offer", width: 250 },
  { key: "source", label: "Source", width: 150 },
  { key: "affiliate_network", label: "Affiliate Network", width: 210 },
  { key: "country_flag", label: "Country flag", width: 120 },
  { key: "region", label: "State/region", width: 160 },
  { key: "city", label: "City", width: 150 },
  { key: "os_logo", label: "OS Logo", width: 110 },
  { key: "browser_logo", label: "Browser logo", width: 130 },
  { key: "connection_type", label: "Connection type", width: 170 },
  { key: "device_type", label: "Device type", width: 170 },
  { key: "device_model", label: "Device model", width: 190 },
  { key: "bot", label: "Bot", width: 90 },
  { key: "unique_clicks_campaign", label: "UC (campaign)", width: 160 },
  { key: "event_type", label: "Event type", width: 130 },
  { key: "campaign", label: "Campaign", width: 220 },
  { key: "campaign_group", label: "Campaign group", width: 180 },
  { key: "landing_page_group", label: "Landing page group", width: 190 },
  { key: "offer_group", label: "Offer group", width: 170 },
  { key: "flow", label: "Flow", width: 170 },
  { key: "site", label: "Site", width: 160 },
  { key: "x_requested_with", label: "X-Requested-With", width: 190 },
  { key: "referrer", label: "Referrer", width: 240 },
  { key: "search_engine", label: "Search engine", width: 170 },
  { key: "keyword", label: "Keyword", width: 170 },
  { key: "visitor_code", label: "Visitor code", width: 170 },
  { key: "campaign_group_id", label: "Campaign group ID", width: 180 },
  { key: "offer_group_id", label: "Offer group ID", width: 160 },
  { key: "landing_group_id", label: "Landing group ID", width: 170 },
  { key: "lp_id", label: "LP ID", width: 100 },
  { key: "offer_id", label: "Offer ID", width: 110 },
  { key: "affiliate_network_id", label: "Aff. Network ID", width: 170 },
  { key: "traffic_source_id", label: "TS ID", width: 100 },
  { key: "ad_campaign_id", label: "Ad Campaign ID", width: 170 },
  { key: "external_id", label: "External ID", width: 150 },
  { key: "creative_id", label: "Creative ID", width: 150 },
  ...Array.from({ length: 30 }, (_, index) => ({
    key: `sub_id_${index + 1}`,
    label: `Sub ID ${index + 1}`,
    width: 140,
  })),
  { key: "mobile_operator", label: "Mobile operator", width: 170 },
  { key: "isp", label: "ISP", width: 170 },
  { key: "country", label: "Country", width: 120 },
  { key: "language", label: "Language", width: 130 },
  { key: "user_agent", label: "User agent", width: 320 },
  { key: "os", label: "Operational system", width: 180 },
  { key: "os_version", label: "OS version", width: 140 },
  { key: "browser", label: "Browser", width: 130 },
  { key: "browser_version", label: "Browser version", width: 170 },
  { key: "ip_1_2_mask", label: "IP 1.2.*.*", width: 140 },
  { key: "ip_1_2_3_mask", label: "IP 1.2.3.*", width: 140 },
  { key: "cost", label: "Cost", width: 110 },
  { key: "domain", label: "Domain", width: 190 },
  { key: "domain_group_id", label: "Domain group ID", width: 170 },
  { key: "domain_group", label: "Domain group", width: 170 },
  { key: "year", label: "Year", width: 100 },
  { key: "month", label: "Month", width: 100 },
  { key: "week", label: "Week", width: 100 },
  { key: "weekday", label: "Weekday", width: 130 },
  { key: "day", label: "Day", width: 130 },
  { key: "hour", label: "Hour", width: 100 },
  { key: "day_and_hour", label: "Day and hour", width: 170 },
  { key: "revenue", label: "Revenue", width: 120 },
  { key: "lp_click_time", label: "LP click time", width: 170 },
  { key: "destination", label: "Destination", width: 180 },
  { key: "unique_clicks_flow", label: "UC (flow)", width: 130 },
  { key: "unique_clicks_global", label: "UC (global)", width: 140 },
  { key: "empty_referrer", label: "Empty referrer", width: 150 },
  { key: "using_proxy", label: "Using proxy", width: 140 },
  { key: "landing_clicked", label: "Landing clicked", width: 160 },
  { key: "registration", label: "Registration", width: 140 },
  { key: "deposits", label: "Deposits", width: 120 },
  { key: "revenue_deposit", label: "Revenue (deposit)", width: 180 },
  { key: "revenue_registration", label: "Revenue (registration)", width: 210 },
  { key: "lead", label: "Lead", width: 100 },
  { key: "sale", label: "Sale", width: 100 },
  { key: "rejected", label: "Rejected", width: 120 },
  { key: "trash", label: "Trash", width: 100 },
  { key: "parent_campaign_id", label: "Parent campaign ID", width: 190 },
  { key: "parent_campaign", label: "Parent campaign", width: 190 },
  { key: "profit_loss_all", label: "Profit/Loss (all)", width: 170 },
  { key: "revenue_hold", label: "Revenue (hold)", width: 170 },
  { key: "revenue_confirmed", label: "Revenue (confirmed)", width: 200 },
  { key: "revenue_rejected", label: "Revenue (rejected)", width: 190 },
  { key: "revenue_trash", label: "Revenue (trash)", width: 170 },
  { key: "time_since_lp_click", label: "Time since LP click", width: 190 },
  { key: "parent_clicks_subid", label: "Parent clicks subid", width: 190 },
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

export default function ReportsPage() {
  return <AppShell title="Reports">{() => <ClicksLog />}</AppShell>;
}

function ClicksLog() {
  const { t } = useI18n();
  const [rows, setRows] = useState<ClickRow[]>([]);
  const [visibleColumns, setVisibleColumns] = useState<string[]>(defaultVisibleColumns);
  const [columnSearch, setColumnSearch] = useState("");
  const [globalSearch, setGlobalSearch] = useState("");
  const [dateFilter, setDateFilter] = useState("today");
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const activeColumns = useMemo(
    () => reportColumns.filter((column) => visibleColumns.includes(column.key)),
    [visibleColumns],
  );

  const selectorColumns = useMemo(() => {
    const search = columnSearch.toLowerCase().trim();
    if (!search) {
      return reportColumns;
    }
    return reportColumns.filter((column) => column.label.toLowerCase().includes(search));
  }, [columnSearch]);

  const filteredRows = useMemo(() => {
    const search = globalSearch.toLowerCase().trim();
    if (!search) {
      return rows;
    }
    return rows.filter((row) =>
      activeColumns.some((column) => formatCell(row[column.key], column.key).toLowerCase().includes(search)),
    );
  }, [activeColumns, globalSearch, rows]);

  const loadRows = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiRequest<ClickRow[]>(`/reports/clicks?date=${dateFilter}&limit=250`);
      setRows(data);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not load clicks log");
    } finally {
      setLoading(false);
    }
  }, [dateFilter]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadRows();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadRows]);

  function toggleColumn(columnKey: string) {
    setVisibleColumns((current) =>
      current.includes(columnKey) ? current.filter((key) => key !== columnKey) : [...current, columnKey],
    );
  }

  function toggleAll() {
    if (visibleColumns.length === reportColumns.length) {
      setVisibleColumns(defaultVisibleColumns);
      return;
    }
    setVisibleColumns(reportColumns.map((column) => column.key));
  }

  function exportCsv() {
    const header = activeColumns.map((column) => csvEscape(column.label)).join(",");
    const body = filteredRows
      .map((row) => activeColumns.map((column) => csvEscape(formatCell(row[column.key], column.key))).join(","))
      .join("\n");
    const blob = new Blob([`${header}\n${body}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "clicks-log.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4 p-5">
      <div className="flex items-center gap-3">
        <h1 className="text-3xl font-semibold">Clicks log</h1>
        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-10 w-72 pl-9"
              placeholder={t("common.search")}
              value={globalSearch}
              onChange={(event) => setGlobalSearch(event.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="lg">{t("common.filters")}</Button>
        <div className="ml-auto flex items-center gap-2">
          <Select className="h-11 w-60" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)}>
            <option value="today">{t("common.today")}</option>
            <option value="yesterday">{t("common.yesterday")}</option>
            <option value="all">{t("common.allTime")}</option>
          </Select>
          <Button variant="outline" size="icon-lg" onClick={() => void loadRows()} title={t("actions.refresh")}>
            <RefreshCw className="size-5" />
          </Button>
          <div className="relative">
            <Button
              variant="outline"
              size="icon-lg"
              onClick={() => setSelectorOpen((open) => !open)}
              title={t("common.columnsSelector")}
            >
              <Settings className="size-5" />
            </Button>
            {selectorOpen ? (
              <div className="absolute right-0 z-30 mt-2 w-80 rounded-md border bg-white p-3 shadow-xl dark:border-neutral-800 dark:bg-neutral-950">
                <div className="mb-3 text-base font-semibold">{t("common.columnsSelector")}</div>
                <Input
                  className="mb-2 h-9"
                  placeholder={t("common.search")}
                  value={columnSearch}
                  onChange={(event) => setColumnSearch(event.target.value)}
                />
                <button
                  className="mb-2 flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm hover:bg-neutral-100 dark:hover:bg-neutral-900"
                  onClick={toggleAll}
                >
                  <input
                    type="checkbox"
                    readOnly
                    checked={visibleColumns.length === reportColumns.length}
                    aria-label={t("common.columns")}
                  />
                  {t("common.columns")}
                </button>
                <div className="max-h-[420px] overflow-auto border-t pt-2 dark:border-neutral-800">
                  {selectorColumns.map((column) => (
                    <label
                      key={column.key}
                      className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-900"
                    >
                      <input
                        type="checkbox"
                        checked={visibleColumns.includes(column.key)}
                        onChange={() => toggleColumn(column.key)}
                      />
                      {column.label}
                    </label>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {error ? <div className="text-sm text-red-500">{error}</div> : null}
      {loading ? <div className="text-sm text-muted-foreground">Loading clicks log...</div> : null}

      <div className="overflow-auto border bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
        <table className="w-full border-collapse text-sm" style={{ minWidth: tableMinWidth(activeColumns) }}>
          <thead className="bg-neutral-100 text-muted-foreground dark:bg-neutral-900">
            <tr>
              {activeColumns.map((column) => (
                <th
                  key={column.key}
                  className="border-r px-3 py-3 text-left font-medium dark:border-neutral-800"
                  style={{ width: column.width ?? 140, minWidth: column.width ?? 140 }}
                >
                  <div className="flex items-center gap-2">
                    <GripVertical className="size-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{column.label}</span>
                    <GripVertical className="ml-auto size-4 shrink-0 text-muted-foreground" />
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row, rowIndex) => (
              <tr key={`${row.click_id ?? row.event_id ?? rowIndex}`} className="border-t hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-900/70">
                {activeColumns.map((column) => (
                  <td key={column.key} className="max-w-80 truncate px-3 py-3" title={formatCell(row[column.key], column.key)}>
                    {renderCell(row[column.key], column.key, row)}
                  </td>
                ))}
              </tr>
            ))}
            {filteredRows.length === 0 ? (
              <tr>
                <td className="px-3 py-10 text-center text-muted-foreground" colSpan={Math.max(activeColumns.length, 1)}>
                  No clicks yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" disabled>
          <ChevronDown className="size-4 rotate-90" />
        </Button>
        <Button variant="outline" size="icon">
          <ChevronDown className="size-4 -rotate-90" />
        </Button>
        <Select className="h-10 w-28" defaultValue="25">
          <option value="25">25</option>
          <option value="50">50</option>
          <option value="100">100</option>
        </Select>
        <span className="text-sm text-muted-foreground">
          1 - {filteredRows.length} of {rows.length}
        </span>
        <Button className="ml-auto h-11 px-6" variant="outline" onClick={exportCsv}>
          {t("actions.export")}
          <ChevronDown className="size-4" />
        </Button>
      </div>
    </div>
  );
}

function renderCell(value: ClickRow[string], key: string, row: ClickRow) {
  if (key === "date_time" && value) {
    return <span className="text-blue-500">{String(value)}</span>;
  }
  if (key === "country_flag") {
    return <CountryFlag code={String(value || row.country || "")} />;
  }
  if (key === "os_logo") {
    return logoCell(value, { android: "Android", apple: "Apple", windows: "Windows", linux: "Linux" });
  }
  if (key === "browser_logo") {
    return logoCell(value, { chrome: "Chrome", firefox: "Firefox", safari: "Safari", edge: "Edge" });
  }
  if (typeof value === "boolean") {
    return value ? "✓" : "";
  }
  return formatCell(value, key);
}

function CountryFlag({ code }: { code: string }) {
  const countryCode = code.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(countryCode)) {
    return "";
  }

  const Flag = (Flags as Record<string, ComponentType<{ className?: string; title?: string }>>)[countryCode];
  if (!Flag) {
    return countryCode;
  }

  return (
    <span className="inline-flex items-center gap-2">
      <Flag className="h-4 w-6 rounded-[1px] shadow-sm" title={countryCode} />
      <span className="text-xs text-neutral-500">{countryCode}</span>
    </span>
  );
}

function logoCell(value: ClickRow[string], map: Record<string, string>) {
  const normalized = String(value ?? "").toLowerCase();
  return map[normalized] ?? formatCell(value, "");
}

function formatCell(value: ClickRow[string], key: string) {
  if (value === null || value === undefined || value === "") {
    return "";
  }
  if (typeof value === "boolean") {
    return value ? "✓" : "";
  }
  if (key === "cost" || key.startsWith("revenue") || key.startsWith("profit")) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return `€${numeric.toFixed(4)}`;
    }
  }
  return String(value);
}

function tableMinWidth(columns: Column[]) {
  return columns.reduce((sum, column) => sum + (column.width ?? 140), 0);
}

function csvEscape(value: string) {
  if (/[",\n]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}
