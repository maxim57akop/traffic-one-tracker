"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  Code2,
  Download,
  ExternalLink,
  FileText,
  Plus,
  RefreshCw,
  Settings,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { CodeWorkspaceEditor } from "@/components/code-workspace-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { getAuthToken } from "@/lib/auth-token";
import { useI18n } from "@/lib/i18n";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080/api";

type OfferStatus = "active" | "paused";
type OfferType = "local" | "redirect" | "preload" | "action";
type PayoutType = "cpa" | "cpc";
type OfferTab = "main" | "settings" | "notes";

const offerTabLabels: Record<OfferTab, "offer.tab.main" | "offer.tab.settings" | "offer.tab.notes"> = {
  main: "offer.tab.main",
  settings: "offer.tab.settings",
  notes: "offer.tab.notes",
};

type Country = {
  code: string;
  name: string;
};

type Offer = {
  id: number;
  team_id: number;
  user_id: number;
  name: string;
  url: string;
  status: OfferStatus;
  payout: number;
  group_name?: string;
  affiliate_network?: string;
  country?: string;
  offer_type: OfferType;
  local_path: string;
  preview_url: string;
  files_count: number;
  payout_type: PayoutType;
  payout_currency: string;
  payout_from_param: boolean;
  conversion_cap_enabled: boolean;
  daily_conversion_cap: number;
  notes?: string;
};

type OfferFile = {
  path: string;
  name: string;
  size: number;
  extension: string;
  editable: boolean;
};

type OfferForm = {
  name: string;
  url: string;
  groupName: string;
  affiliateNetwork: string;
  country: string;
  status: OfferStatus;
  offerType: OfferType;
  folder: string;
  zipFile: File | null;
  payoutType: PayoutType;
  payout: string;
  payoutCurrency: string;
  payoutFromParam: boolean;
  conversionCapEnabled: boolean;
  dailyConversionCap: string;
  notes: string;
};

const emptyForm: OfferForm = {
  name: "",
  url: "",
  groupName: "",
  affiliateNetwork: "",
  country: "",
  status: "active",
  offerType: "local",
  folder: "",
  zipFile: null,
  payoutType: "cpa",
  payout: "0",
  payoutCurrency: "EUR",
  payoutFromParam: true,
  conversionCapEnabled: false,
  dailyConversionCap: "0",
  notes: "",
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

async function apiFormRequest<T>(path: string, formData: FormData, method = "POST") {
  const token = getAuthToken();
  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(error.message ?? "Request failed");
  }

  return response.json() as Promise<T>;
}

export default function OffersPage() {
  return <AppShell title="Offers">{() => <OffersManagement />}</AppShell>;
}

function OffersManagement() {
  const { t } = useI18n();
  const [offers, setOffers] = useState<Offer[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [search, setSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState("all");
  const [networkFilter, setNetworkFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("today");
  const [form, setForm] = useState<OfferForm>(emptyForm);
  const [editingOffer, setEditingOffer] = useState<Offer | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);
  const [codeOffer, setCodeOffer] = useState<Offer | null>(null);
  const [files, setFiles] = useState<OfferFile[]>([]);
  const [selectedFile, setSelectedFile] = useState("");
  const [fileContent, setFileContent] = useState("");
  const [activeTab, setActiveTab] = useState<OfferTab>("main");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [codeSaving, setCodeSaving] = useState(false);
  const [error, setError] = useState("");

  const groups = useMemo(() => uniqueSorted(offers.map((offer) => offer.group_name)), [offers]);
  const networks = useMemo(
    () => uniqueSorted(offers.map((offer) => offer.affiliate_network)),
    [offers],
  );

  const filteredOffers = useMemo(() => {
    const normalizedSearch = search.toLowerCase().trim();
    return offers.filter((offer) => {
      const matchesSearch =
        offer.name.toLowerCase().includes(normalizedSearch) ||
        offer.url.toLowerCase().includes(normalizedSearch) ||
        (offer.affiliate_network ?? "").toLowerCase().includes(normalizedSearch);
      const matchesGroup = groupFilter === "all" || offer.group_name === groupFilter;
      const matchesNetwork = networkFilter === "all" || offer.affiliate_network === networkFilter;
      const matchesStatus = statusFilter === "all" || offer.status === statusFilter;
      return matchesSearch && matchesGroup && matchesNetwork && matchesStatus;
    });
  }, [groupFilter, networkFilter, offers, search, statusFilter]);

  const totals = useMemo(
    () => filteredOffers.reduce((acc) => ({ clicks: acc.clicks + 0, leads: acc.leads + 0, sales: acc.sales + 0 }), { clicks: 0, leads: 0, sales: 0 }),
    [filteredOffers],
  );

  const loadOffers = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const [offerData, countryData] = await Promise.all([
        apiRequest<Offer[]>("/offers"),
        apiRequest<Country[]>("/countries"),
      ]);
      setOffers(offerData);
      setCountries(countryData);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not load offers");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadOffers();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadOffers]);

  function openCreateModal() {
    setEditingOffer(null);
    setForm(emptyForm);
    setActiveTab("main");
    setError("");
    setModalOpen(true);
  }

  function openEditModal(offer: Offer) {
    setEditingOffer(offer);
    setForm({
      name: offer.name,
      url: offer.offer_type === "local" ? "" : offer.url,
      groupName: offer.group_name ?? "",
      affiliateNetwork: offer.affiliate_network ?? "",
      country: offer.country ?? "",
      status: offer.status,
      offerType: offer.offer_type,
      folder: offer.local_path,
      zipFile: null,
      payoutType: offer.payout_type,
      payout: String(offer.payout ?? 0),
      payoutCurrency: offer.payout_currency || "EUR",
      payoutFromParam: offer.payout_from_param,
      conversionCapEnabled: offer.conversion_cap_enabled,
      dailyConversionCap: String(offer.daily_conversion_cap ?? 0),
      notes: offer.notes ?? "",
    });
    setActiveTab("main");
    setError("");
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingOffer(null);
    setForm(emptyForm);
  }

  async function saveOffer() {
    if (!form.name.trim()) {
      setError("Offer name is required");
      return;
    }
    if (form.offerType !== "local" && !form.url.trim()) {
      setError("Offer URL is required");
      return;
    }

    setSaving(true);
    setError("");
    try {
      let saved: Offer;
      if (form.zipFile) {
        const payload = offerFormData(form);
        const path = editingOffer ? `/offers/${editingOffer.id}` : "/offers";
        saved = await apiFormRequest<Offer>(path, payload, editingOffer ? "PATCH" : "POST");
      } else {
        const payload = offerPayload(form);
        if (editingOffer) {
          saved = await apiRequest<Offer>(`/offers/${editingOffer.id}`, {
            method: "PATCH",
            body: JSON.stringify(payload),
          });
        } else {
          saved = await apiRequest<Offer>("/offers", {
            method: "POST",
            body: JSON.stringify(payload),
          });
        }
      }

      setOffers((items) =>
        editingOffer
          ? items.map((item) => (item.id === saved.id ? saved : item))
          : [saved, ...items],
      );
      closeModal();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not save offer");
    } finally {
      setSaving(false);
    }
  }

  async function deleteOffer(offer: Offer) {
    const confirmed = window.confirm(`Delete ${offer.name}?`);
    if (!confirmed) {
      return;
    }

    setError("");
    try {
      await apiRequest<void>(`/offers/${offer.id}`, { method: "DELETE" });
      setOffers((items) => items.filter((item) => item.id !== offer.id));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not delete offer");
    }
  }

  function previewOffer(offer: Offer) {
    const href = offer.offer_type === "local" ? offer.preview_url : offer.url;
    if (href) {
      window.open(href, "_blank", "noopener,noreferrer");
    }
  }

  async function openCode(offer: Offer) {
    setCodeOffer(offer);
    setCodeOpen(true);
    setFiles([]);
    setSelectedFile("");
    setFileContent("");
    setError("");

    try {
      const offerFiles = await apiRequest<OfferFile[]>(`/offers/${offer.id}/files`);
      setFiles(offerFiles);
      const firstEditable =
        offerFiles.find((file) => file.path === "index.html" && file.editable) ??
        offerFiles.find((file) => file.editable);
      if (firstEditable) {
        await selectFile(offer, firstEditable.path);
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not open code");
    }
  }

  async function selectFile(offer: Offer, path: string) {
    setSelectedFile(path);
    const data = await apiRequest<{ content: string }>(
      `/offers/${offer.id}/files/content?path=${encodeURIComponent(path)}`,
    );
    setFileContent(data.content);
  }

  async function saveCode() {
    if (!codeOffer || !selectedFile) {
      return;
    }

    setCodeSaving(true);
    setError("");
    try {
      await apiRequest(`/offers/${codeOffer.id}/files/content`, {
        method: "PATCH",
        body: JSON.stringify({ path: selectedFile, content: fileContent }),
      });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not save file");
    } finally {
      setCodeSaving(false);
    }
  }

  async function downloadOffer(offer: Offer) {
    const token = getAuthToken();
    const response = await fetch(`${API_URL}/offers/${offer.id}/download`, {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    if (!response.ok) {
      setError("Could not download offer");
      return;
    }

    const blob = await response.blob();
    const href = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = `${offer.local_path || offer.name}.zip`;
    link.click();
    window.URL.revokeObjectURL(href);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          className="h-9 rounded-md bg-[#45b84a] px-3 text-white hover:bg-[#3da442]"
          onClick={openCreateModal}
        >
          <Plus className="h-4 w-4" />
          {t("actions.create")}
        </Button>
        <Button variant="outline" className="h-9 rounded-md px-3">
          {t("common.groups")}
        </Button>
        <Input
          className="h-9 w-64 rounded-md bg-white"
          placeholder={t("common.search")}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select className="h-9 w-52 rounded-md bg-white" value={groupFilter} onChange={(event) => setGroupFilter(event.target.value)}>
          <option value="all">{t("common.allGroups")}</option>
          {groups.map((group) => (
            <option key={group} value={group}>{group}</option>
          ))}
        </Select>
        <Select className="h-9 w-64 rounded-md bg-white" value={networkFilter} onChange={(event) => setNetworkFilter(event.target.value)}>
          <option value="all">{t("offer.allAffiliateNetworks")}</option>
          {networks.map((network) => (
            <option key={network} value={network}>{network}</option>
          ))}
        </Select>
        <Select className="h-9 w-52 rounded-md bg-white" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          <option value="all">{t("common.allStates")}</option>
          <option value="active">{t("common.active")}</option>
          <option value="paused">{t("common.paused")}</option>
        </Select>
        <Select className="h-9 w-52 rounded-md bg-white" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)}>
          <option value="today">{t("common.today")}</option>
          <option value="yesterday">{t("common.yesterday")}</option>
          <option value="week">{t("common.last7Days")}</option>
        </Select>
        <Button variant="outline" size="icon-lg" className="rounded-md" onClick={() => void loadOffers()}>
          <RefreshCw className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="icon-lg" className="rounded-md">
          <Settings className="h-4 w-4" />
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="overflow-x-auto border border-neutral-200 bg-white shadow-sm">
        <table className="w-full min-w-[1320px] border-collapse text-left text-sm">
          <thead className="bg-neutral-50 text-neutral-500">
            <tr>
              <th className="h-10 w-10 border-b border-neutral-200 px-3 font-medium">
                <input className="size-4" type="checkbox" />
              </th>
              <th className="h-10 w-20 border-b border-neutral-200 px-3 font-medium">{t("common.id")}</th>
              <th className="h-10 border-b border-neutral-200 px-3 font-medium">{t("common.name")}</th>
              <th className="h-10 border-b border-neutral-200 px-3 font-medium">{t("common.group")}</th>
              <th className="h-10 w-28 border-b border-neutral-200 px-3 font-medium">{t("common.actions")}</th>
              <th className="h-10 border-b border-neutral-200 px-3 font-medium">{t("offer.country")}</th>
              <th className="h-10 border-b border-neutral-200 px-3 font-medium">{t("offer.affiliateNetwork")}</th>
              <th className="h-10 border-b border-neutral-200 px-3 font-medium">{t("landing.clicks")}</th>
              <th className="h-10 border-b border-neutral-200 px-3 font-medium">{t("offer.leads")}</th>
              <th className="h-10 border-b border-neutral-200 px-3 font-medium">{t("offer.sales")}</th>
              <th className="h-10 border-b border-neutral-200 px-3 font-medium">{t("offer.payout")}</th>
              <th className="h-10 w-20 border-b border-neutral-200 px-3 text-right font-medium" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={12} className="h-20 px-3 text-neutral-500">{t("offer.loading")}</td>
              </tr>
            ) : filteredOffers.length === 0 ? (
              <tr>
                <td colSpan={12} className="h-20 px-3 text-neutral-500">{t("offer.noItems")}</td>
              </tr>
            ) : (
              filteredOffers.map((offer) => (
                <tr key={offer.id} className="border-b border-neutral-200 last:border-0">
                  <td className="h-11 px-3"><input className="size-4" type="checkbox" /></td>
                  <td className="h-11 px-3 text-neutral-600">{offer.id}</td>
                  <td className="h-11 max-w-[440px] px-3">
                    <button
                      className="max-w-full truncate font-medium text-blue-600 hover:text-blue-700 hover:underline"
                      onClick={() => openEditModal(offer)}
                      type="button"
                    >
                      {offer.name}
                    </button>
                    {offer.offer_type !== "local" && <div className="truncate text-xs text-neutral-400">{offer.url}</div>}
                  </td>
                  <td className="h-11 px-3 text-neutral-700">{offer.group_name ?? "-"}</td>
                  <td className="h-11 px-3">
                    <div className="flex items-center gap-1">
                      <IconAction label={t("actions.preview")} onClick={() => previewOffer(offer)}>
                        <ExternalLink className="h-4 w-4" />
                      </IconAction>
                      {offer.offer_type === "local" && (
                        <>
                          <IconAction label={t("landing.code")} onClick={() => void openCode(offer)}>
                            <Code2 className="h-4 w-4" />
                          </IconAction>
                          <IconAction label={t("actions.download")} onClick={() => void downloadOffer(offer)}>
                            <Download className="h-4 w-4" />
                          </IconAction>
                          <span className="ml-1 inline-flex items-center gap-1 text-xs text-neutral-400">
                            <FileText className="h-3.5 w-3.5" />
                            {offer.files_count}
                          </span>
                        </>
                      )}
                    </div>
                  </td>
                  <td className="h-11 px-3 text-neutral-700">{countryLabel(countries, offer.country)}</td>
                  <td className="h-11 px-3 text-neutral-700">{offer.affiliate_network ?? "-"}</td>
                  <td className="h-11 px-3">0</td>
                  <td className="h-11 px-3">0</td>
                  <td className="h-11 px-3">0</td>
                  <td className="h-11 px-3">{formatMoney(offer.payout, offer.payout_currency)}</td>
                  <td className="h-11 px-3 text-right">
                    <Button
                      aria-label={`${t("actions.delete")} ${offer.name}`}
                      size="icon-sm"
                      variant="ghost"
                      className="text-red-500 hover:bg-red-50 hover:text-red-600"
                      onClick={() => void deleteOffer(offer)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))
            )}
            <tr className="bg-neutral-50 text-neutral-600">
              <td className="h-10 px-3" />
              <td className="h-10 px-3" />
              <td className="h-10 px-3" />
              <td className="h-10 px-3" />
              <td className="h-10 px-3" />
              <td className="h-10 px-3" />
              <td className="h-10 px-3" />
              <td className="h-10 px-3">{totals.clicks}</td>
              <td className="h-10 px-3">{totals.leads}</td>
              <td className="h-10 px-3">{totals.sales}</td>
              <td className="h-10 px-3" />
              <td className="h-10 px-3" />
            </tr>
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-neutral-600">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon-lg" disabled>‹</Button>
          <Button variant="outline" size="icon-lg" disabled>›</Button>
          <Select className="h-9 w-24 rounded-md bg-white" defaultValue="25">
            <option value="25">25</option>
            <option value="50">50</option>
            <option value="100">100</option>
          </Select>
          <span>1 - {filteredOffers.length} of {offers.length}</span>
        </div>
        <Button variant="outline">{t("actions.export")}</Button>
      </div>

      {modalOpen && (
        <OfferModal
          activeTab={activeTab}
          countries={countries}
          editingOffer={editingOffer}
          error={error}
          form={form}
          saving={saving}
          setActiveTab={setActiveTab}
          setForm={setForm}
          onClose={closeModal}
          onSave={() => void saveOffer()}
        />
      )}

      {codeOpen && codeOffer && (
        <CodeWorkspaceEditor
          content={fileContent}
          files={files}
          itemName={codeOffer.name}
          rootLabel={`/lander/${codeOffer.local_path}`}
          labels={{
            close: t("actions.close"),
            createFile: t("actions.createFile"),
            noEditableFile: t("landing.noEditableFile"),
            noFiles: t("landing.noFiles"),
            save: t("actions.save"),
            uploadFile: t("actions.uploadFile"),
          }}
          saving={codeSaving}
          selectedFile={selectedFile}
          setContent={setFileContent}
          onClose={() => setCodeOpen(false)}
          onSave={() => void saveCode()}
          onSelectFile={(path) => void selectFile(codeOffer, path)}
        />
      )}
    </div>
  );
}

function OfferModal({
  activeTab,
  countries,
  editingOffer,
  error,
  form,
  saving,
  setActiveTab,
  setForm,
  onClose,
  onSave,
}: {
  activeTab: OfferTab;
  countries: Country[];
  editingOffer: Offer | null;
  error: string;
  form: OfferForm;
  saving: boolean;
  setActiveTab: (tab: OfferTab) => void;
  setForm: (form: OfferForm) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const { t } = useI18n();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
      <div className="max-h-[calc(100vh-32px)] w-full max-w-5xl overflow-auto rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between px-8 py-6">
          <h2 className="text-2xl font-semibold tracking-normal">
            {editingOffer ? t("offer.editTitle") : t("offer.createTitle")}
          </h2>
          <Button aria-label={t("actions.close")} variant="ghost" size="icon-lg" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="px-8">
          <div className="flex border-b border-neutral-200">
            {(["main", "settings", "notes"] as const).map((tab) => (
              <button
                key={tab}
                className={[
                  "h-12 px-3 text-base font-semibold capitalize",
                  activeTab === tab
                    ? "border-b-2 border-neutral-950 text-neutral-950"
                    : "text-neutral-500 hover:text-neutral-900",
                ].join(" ")}
                onClick={() => setActiveTab(tab)}
                type="button"
              >
                {t(offerTabLabels[tab])}
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-[560px] space-y-7 px-8 py-6">
          {activeTab === "main" && <OfferMainTab form={form} setForm={setForm} />}
          {activeTab === "settings" && <OfferSettingsTab countries={countries} form={form} setForm={setForm} />}
          {activeTab === "notes" && <OfferNotesTab form={form} setForm={setForm} />}

          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-neutral-200 px-8 py-4">
          <Button variant="outline" onClick={onClose}>{t("actions.cancel")}</Button>
          <Button className="bg-[#45b84a] text-white hover:bg-[#3da442]" disabled={saving} onClick={onSave}>
            {editingOffer ? t("actions.save") : t("actions.create")}
          </Button>
        </div>
      </div>
    </div>
  );
}

function OfferMainTab({ form, setForm }: { form: OfferForm; setForm: (form: OfferForm) => void }) {
  const { t } = useI18n();

  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="offer-name">{t("offer.name")}</Label>
        <Input id="offer-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="offer-group">{t("common.group")}</Label>
          <Input id="offer-group" placeholder={t("common.typeSearchCreate")} value={form.groupName} onChange={(event) => setForm({ ...form, groupName: event.target.value })} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="offer-network">{t("offer.affiliateNetwork")}</Label>
          <Input id="offer-network" placeholder={t("common.typeSearchCreate")} value={form.affiliateNetwork} onChange={(event) => setForm({ ...form, affiliateNetwork: event.target.value })} />
        </div>
      </div>

      <label className="inline-flex items-center gap-2 text-sm font-medium">
        <input checked className="size-4 accent-blue-500" readOnly type="radio" />
        Local
      </label>

      {form.offerType === "local" ? (
        <>
          <div className="space-y-2">
            <Label>{t("landing.zipFile")}</Label>
            <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-md border border-neutral-200 bg-white px-4 text-sm font-medium shadow-sm hover:bg-neutral-50">
              <Upload className="h-4 w-4" />
              {t("landing.chooseFile")}
              <input
                className="sr-only"
                type="file"
                accept=".zip,application/zip,application/x-zip-compressed"
                onChange={(event) => setForm({ ...form, zipFile: event.target.files?.[0] ?? null })}
              />
            </label>
            <p className="text-sm text-neutral-400">
              {form.zipFile ? form.zipFile.name : t("landing.uploadHint")}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="offer-folder">{t("landing.folder")}</Label>
            <div className="flex">
              <span className="inline-flex h-9 items-center rounded-l-md border border-r-0 border-neutral-200 bg-neutral-50 px-3 text-sm text-neutral-500">
                /lander/
              </span>
              <Input
                id="offer-folder"
                className="rounded-l-none"
                placeholder={t("offer.folderAuto")}
                value={form.folder}
                onChange={(event) => setForm({ ...form, folder: event.target.value })}
              />
            </div>
          </div>
        </>
      ) : (
        <div className="space-y-2">
          <Label htmlFor="offer-url">{t("offer.url")}</Label>
          <Input
            id="offer-url"
            placeholder="https://example.com/?subid={click_id}"
            value={form.url}
            onChange={(event) => setForm({ ...form, url: event.target.value })}
          />
        </div>
      )}
    </>
  );
}

function OfferSettingsTab({
  countries,
  form,
  setForm,
}: {
  countries: Country[];
  form: OfferForm;
  setForm: (form: OfferForm) => void;
}) {
  const { t } = useI18n();

  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="offer-country">{t("offer.countries")}</Label>
        <Select
          id="offer-country"
          className="h-9 w-full rounded-md bg-white"
          value={form.country}
          onChange={(event) => setForm({ ...form, country: event.target.value })}
        >
          <option value="">{t("common.none")}</option>
          {countries.map((country) => (
            <option key={country.code} value={country.code}>
              {country.name} ({country.code})
            </option>
          ))}
        </Select>
      </div>
    </>
  );
}

function OfferNotesTab({ form, setForm }: { form: OfferForm; setForm: (form: OfferForm) => void }) {
  const { t } = useI18n();

  return (
    <div className="space-y-2">
      <Label htmlFor="offer-notes">{t("offer.notes")}</Label>
      <textarea
        id="offer-notes"
        className="min-h-56 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-400"
        value={form.notes}
        onChange={(event) => setForm({ ...form, notes: event.target.value })}
      />
    </div>
  );
}

function IconAction({
  children,
  label,
  onClick,
}: {
  children: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <Button aria-label={label} size="icon-sm" title={label} variant="ghost" onClick={onClick}>
      {children}
    </Button>
  );
}

function offerPayload(form: OfferForm) {
  return {
    name: form.name,
    url: form.offerType === "local" ? "" : form.url,
    group_name: form.groupName,
    affiliate_network: form.affiliateNetwork,
    country: form.country,
    status: form.status,
    offer_type: form.offerType,
    folder: form.folder,
    payout_type: form.payoutType,
    payout: Number(form.payout) || 0,
    payout_currency: form.payoutCurrency,
    payout_from_param: form.payoutFromParam,
    conversion_cap_enabled: form.conversionCapEnabled,
    daily_conversion_cap: Number(form.dailyConversionCap) || 0,
    notes: form.notes,
  };
}

function offerFormData(form: OfferForm) {
  const payload = offerPayload(form);
  const formData = new FormData();
  Object.entries(payload).forEach(([key, value]) => {
    formData.set(key, String(value));
  });
  if (form.zipFile) {
    formData.set("zip", form.zipFile);
  }
  return formData;
}

function uniqueSorted(values: Array<string | undefined>) {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))).sort((a, b) => a.localeCompare(b));
}

function countryLabel(countries: Country[], value?: string) {
  if (!value) {
    return "-";
  }
  const country = countries.find((item) => item.code === value);
  return country ? country.name : value;
}

function formatMoney(value: number, currency: string) {
  return `${currency || "EUR"} ${Number(value || 0).toFixed(4)}`;
}
