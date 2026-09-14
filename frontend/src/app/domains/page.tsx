"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Copy,
  ExternalLink,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { getAuthToken } from "@/lib/auth-token";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080/api";

type DomainStatus = "ok" | "awaiting_dns" | "disabled";

type Domain = {
  id: number;
  team_id: number;
  user_id: number;
  domain: string;
  group_name?: string;
  status: DomainStatus;
  allow_indexing: boolean;
  allow_admin_access: boolean;
  https_only: boolean;
  index_campaign_id?: number;
  index_campaign_name?: string;
  index_campaign_slug?: string;
  campaigns_count: number;
};

type Campaign = {
  id: number;
  name: string;
  slug: string;
  status: string;
};

type DomainForm = {
  domain: string;
  groupName: string;
  allowIndexing: boolean;
  allowAdminAccess: boolean;
  httpsOnly: boolean;
  indexCampaignID: string;
};

const emptyForm: DomainForm = {
  domain: "",
  groupName: "",
  allowIndexing: false,
  allowAdminAccess: false,
  httpsOnly: true,
  indexCampaignID: "",
};

async function apiRequest<T>(path: string, options: RequestInit = {}) {
  const token = getAuthToken();
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

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export default function DomainsPage() {
  return <AppShell title="Domains">{() => <DomainsManagement />}</AppShell>;
}

function DomainsManagement() {
  const [domains, setDomains] = useState<Domain[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [serverIP, setServerIP] = useState("127.0.0.1");
  const [search, setSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [form, setForm] = useState<DomainForm>(emptyForm);
  const [editingDomain, setEditingDomain] = useState<Domain | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const groups = useMemo(() => {
    const names = domains
      .map((domain) => domain.group_name?.trim())
      .filter((name): name is string => Boolean(name));
    return Array.from(new Set(names)).sort((a, b) => a.localeCompare(b));
  }, [domains]);

  const filteredDomains = useMemo(() => {
    return domains.filter((domain) => {
      const matchesSearch = domain.domain.toLowerCase().includes(search.toLowerCase().trim());
      const matchesGroup = groupFilter === "all" || domain.group_name === groupFilter;
      const matchesStatus = statusFilter === "all" || domain.status === statusFilter;
      return matchesSearch && matchesGroup && matchesStatus;
    });
  }, [domains, groupFilter, search, statusFilter]);

  const loadDomains = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const [domainData, campaignData, ipData] = await Promise.all([
        apiRequest<Domain[]>("/domains"),
        apiRequest<Campaign[]>("/campaigns"),
        apiRequest<{ server_ip: string }>("/domains/server-ip"),
      ]);
      setDomains(domainData);
      setCampaigns(campaignData);
      setServerIP(ipData.server_ip);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not load domains");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadDomains();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadDomains]);

  function openCreateModal() {
    setEditingDomain(null);
    setForm(emptyForm);
    setError("");
    setModalOpen(true);
  }

  function openEditModal(domain: Domain) {
    setEditingDomain(domain);
    setForm({
      domain: domain.domain,
      groupName: domain.group_name ?? "",
      allowIndexing: domain.allow_indexing,
      allowAdminAccess: domain.allow_admin_access,
      httpsOnly: domain.https_only,
      indexCampaignID: domain.index_campaign_id ? String(domain.index_campaign_id) : "",
    });
    setError("");
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingDomain(null);
    setForm(emptyForm);
  }

  async function saveDomain() {
    if (!form.domain.trim()) {
      setError("Domain is required");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const indexCampaignID = form.indexCampaignID ? Number(form.indexCampaignID) : null;
      const payload = {
        domain: form.domain,
        group_name: form.groupName,
        allow_indexing: form.allowIndexing,
        allow_admin_access: form.allowAdminAccess,
        https_only: form.httpsOnly,
        ...(indexCampaignID ? { index_campaign_id: indexCampaignID } : { clear_index_page: true }),
      };

      if (editingDomain) {
        const updatedDomain = await apiRequest<Domain>(`/domains/${editingDomain.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        setDomains((items) =>
          items.map((item) => (item.id === updatedDomain.id ? updatedDomain : item)),
        );
      } else {
        const createdDomains = await apiRequest<Domain[]>("/domains", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setDomains((items) => [...createdDomains, ...items]);
      }

      closeModal();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not save domain");
    } finally {
      setSaving(false);
    }
  }

  async function deleteDomain(domain: Domain) {
    const confirmed = window.confirm(`Delete ${domain.domain}?`);
    if (!confirmed) {
      return;
    }

    setError("");
    try {
      await apiRequest<void>(`/domains/${domain.id}`, { method: "DELETE" });
      setDomains((items) => items.filter((item) => item.id !== domain.id));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not delete domain");
    }
  }

  async function copyServerIP() {
    await navigator.clipboard.writeText(serverIP);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          className="h-9 rounded-md bg-[#45b84a] px-3 text-white hover:bg-[#3da442]"
          onClick={openCreateModal}
        >
          <Plus className="h-4 w-4" />
          Add
        </Button>
        <Button variant="outline" className="h-9 rounded-md px-3">
          Groups
        </Button>
        <Input
          className="h-9 w-64 rounded-md bg-white"
          placeholder="Search domain"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <button
          className="inline-flex h-9 items-center gap-2 rounded-md bg-red-50 px-3 font-mono text-sm font-semibold text-red-400 hover:bg-red-100"
          onClick={() => void copyServerIP()}
          type="button"
        >
          {serverIP}
          <Copy className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select
          className="h-9 w-52 rounded-md bg-white"
          value={groupFilter}
          onChange={(event) => setGroupFilter(event.target.value)}
        >
          <option value="all">All groups</option>
          {groups.map((group) => (
            <option key={group} value={group}>
              {group}
            </option>
          ))}
        </Select>
        <Select
          className="h-9 w-52 rounded-md bg-white"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
        >
          <option value="all">All statuses</option>
          <option value="ok">OK</option>
          <option value="awaiting_dns">Awaiting DNS</option>
          <option value="disabled">Disabled</option>
        </Select>
        <Button variant="outline" size="icon-lg" className="rounded-md" onClick={() => void loadDomains()}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="overflow-hidden border border-neutral-200 bg-white shadow-sm">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="bg-neutral-50 text-neutral-500">
            <tr>
              <th className="h-10 w-14 border-b border-neutral-200 px-3 font-medium">ID</th>
              <th className="h-10 border-b border-neutral-200 px-3 font-medium">Domain</th>
              <th className="h-10 border-b border-neutral-200 px-3 font-medium">Group</th>
              <th className="h-10 border-b border-neutral-200 px-3 font-medium">Status</th>
              <th className="h-10 border-b border-neutral-200 px-3 font-medium">Features</th>
              <th className="h-10 border-b border-neutral-200 px-3 font-medium">Index page</th>
              <th className="h-10 w-28 border-b border-neutral-200 px-3 font-medium">Campaigns</th>
              <th className="h-10 w-20 border-b border-neutral-200 px-3 text-right font-medium" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="h-20 px-3 text-neutral-500">
                  Loading domains...
                </td>
              </tr>
            ) : filteredDomains.length === 0 ? (
              <tr>
                <td colSpan={8} className="h-20 px-3 text-neutral-500">
                  No domains yet.
                </td>
              </tr>
            ) : (
              filteredDomains.map((domain) => (
                <tr key={domain.id} className="border-b border-neutral-200 last:border-0">
                  <td className="h-11 px-3 text-neutral-600">{domain.id}</td>
                  <td className="h-11 px-3">
                    <button
                      className="font-medium text-blue-600 hover:text-blue-700 hover:underline"
                      onClick={() => openEditModal(domain)}
                      type="button"
                    >
                      {domain.domain}
                    </button>
                  </td>
                  <td className="h-11 px-3 text-neutral-700">{domain.group_name ?? "-"}</td>
                  <td className="h-11 px-3">
                    <span className={statusClassName(domain.status)}>{statusLabel(domain.status)}</span>
                  </td>
                  <td className="h-11 px-3">
                    <div className="flex flex-wrap gap-1.5">
                      {domain.https_only && <Badge>HTTPS-only</Badge>}
                      {!domain.allow_indexing && <Badge>Robots disallow</Badge>}
                      {domain.allow_admin_access && <Badge>Admin access</Badge>}
                    </div>
                  </td>
                  <td className="h-11 px-3 text-neutral-700">
                    {domain.index_campaign_name ?? "None"}
                  </td>
                  <td className="h-11 px-3">
                    <span className="font-medium text-blue-600">{domain.campaigns_count}</span>
                  </td>
                  <td className="h-11 px-3 text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        aria-label={`Open ${domain.domain}`}
                        disabled={domain.status !== "ok"}
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => window.open(`http://${domain.domain}`, "_blank")}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                      <Button
                        aria-label={`Delete ${domain.domain}`}
                        size="icon-sm"
                        variant="ghost"
                        className="text-red-500 hover:bg-red-50 hover:text-red-600"
                        onClick={() => void deleteDomain(domain)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <div className="max-h-[calc(100vh-32px)] w-full max-w-3xl overflow-auto rounded-lg bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-neutral-200 px-6 py-4">
              <h2 className="text-xl font-semibold tracking-normal">
                {editingDomain ? "Edit Domain" : "Add Domain"}
              </h2>
              <div className="flex items-center gap-3">
                <Button aria-label="Close" variant="ghost" size="icon-sm" onClick={closeModal}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="space-y-6 px-6 py-5">
              <div className="space-y-2">
                <Label htmlFor="domain-name">Domain</Label>
                <Input
                  id="domain-name"
                  placeholder="domain.com"
                  value={form.domain}
                  onChange={(event) => setForm({ ...form, domain: event.target.value })}
                />
                {!editingDomain && (
                  <p className="text-sm text-neutral-500">
                    To add multiple domains, type a list with separation by commas.
                  </p>
                )}
              </div>

              <div className="grid gap-5 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="domain-group">Group</Label>
                  <Input
                    id="domain-group"
                    placeholder="Type to search or create"
                    value={form.groupName}
                    onChange={(event) => setForm({ ...form, groupName: event.target.value })}
                  />
                </div>
                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-800">
                  Status is checked automatically by DNS every 5 minutes. Domain becomes OK only
                  when its A record points to the server IP.
                </div>
              </div>

              <ToggleRow
                description="Controls the generated robots.txt for this tracker domain."
                falseLabel="Disallow"
                label="Crawlers"
                onChange={(value) => setForm({ ...form, allowIndexing: value })}
                trueLabel="Allow indexing"
                value={form.allowIndexing}
              />

              <ToggleRow
                description="Allow this domain to be used for dashboard access later."
                falseLabel="Deny access"
                label="Admin dashboard"
                onChange={(value) => setForm({ ...form, allowAdminAccess: value })}
                trueLabel="Allow access"
                value={form.allowAdminAccess}
              />

              <ToggleRow
                description="Marks the domain as HTTPS-only in tracker settings."
                falseLabel="Off"
                label="HTTPS-only"
                onChange={(value) => setForm({ ...form, httpsOnly: value })}
                trueLabel="On"
                value={form.httpsOnly}
              />

              <div className="space-y-2">
                <Label htmlFor="domain-index">Index page</Label>
                <Select
                  id="domain-index"
                  value={form.indexCampaignID}
                  onChange={(event) => setForm({ ...form, indexCampaignID: event.target.value })}
                >
                  <option value="">None</option>
                  {campaigns.map((campaign) => (
                    <option key={campaign.id} value={campaign.id}>
                      {campaign.name} /{campaign.slug}
                    </option>
                  ))}
                </Select>
                <p className="text-sm text-neutral-500">
                  Choose a campaign to open when this domain is requested without a slug.
                </p>
              </div>

              <div className="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-600">
                Add an A record on your registrar side with server IP{" "}
                <span className="font-mono font-semibold text-red-400">{serverIP}</span>.
              </div>

              {error && (
                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-neutral-200 px-6 py-4">
              <Button variant="outline" onClick={closeModal}>
                Cancel
              </Button>
              <Button
                className="bg-[#45b84a] text-white hover:bg-[#3da442]"
                disabled={saving}
                onClick={() => void saveDomain()}
              >
                <Plus className="h-4 w-4" />
                {editingDomain ? "Save" : "Add"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ToggleRow({
  description,
  falseLabel,
  label,
  onChange,
  trueLabel,
  value,
}: {
  description: string;
  falseLabel: string;
  label: string;
  onChange: (value: boolean) => void;
  trueLabel: string;
  value: boolean;
}) {
  return (
    <div className="space-y-2">
      <div className="text-sm font-medium text-neutral-950">{label}</div>
      <div className="flex flex-wrap gap-5">
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            checked={value}
            className="size-4 accent-blue-500"
            onChange={() => onChange(true)}
            type="radio"
          />
          {trueLabel}
        </label>
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            checked={!value}
            className="size-4 accent-blue-500"
            onChange={() => onChange(false)}
            type="radio"
          />
          {falseLabel}
        </label>
      </div>
      <p className="text-sm text-neutral-500">{description}</p>
    </div>
  );
}

function statusLabel(status: DomainStatus) {
  if (status === "ok") {
    return "OK";
  }
  if (status === "awaiting_dns") {
    return "Awaiting DNS";
  }
  return "Disabled";
}

function statusClassName(status: DomainStatus) {
  if (status === "ok") {
    return "font-medium text-[#45b84a]";
  }
  if (status === "awaiting_dns") {
    return "font-medium text-amber-600";
  }
  return "font-medium text-neutral-400";
}
