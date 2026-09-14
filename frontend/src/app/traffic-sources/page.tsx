"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Plus,
  RefreshCw,
  Settings,
  Trash2,
  X,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { getAuthToken } from "@/lib/auth-token";
import { useI18n } from "@/lib/i18n";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080/api";

type TrafficSource = {
  id: number;
  team_id: number;
  user_id: number;
  name: string;
  postback_url?: string;
  parameters: Record<string, string>;
  notes?: string;
};

type SourceForm = {
  name: string;
  parameters: Record<string, string>;
  notes: string;
};

type SourceTemplate = {
  name: string;
  parameters: Record<string, string>;
};

const parameterRows = [
  ["Keyword", "keyword"],
  ["Cost", "cost"],
  ["Currency", "currency"],
  ["External ID", "fbclid"],
  ["Creative ID", "creative_id"],
  ["Ad Campaign ID", "utm_campaign"],
  ["Site", "utm_source"],
  ...Array.from({ length: 30 }, (_, index) => [`Sub Id ${index + 1}`, `sub_id_${index + 1}`]),
];

const sourceTemplates: SourceTemplate[] = [
  {
    name: "FB",
    parameters: {
      fbclid: "{fbclid}",
      utm_campaign: "{{campaign.name}}",
      utm_source: "{{site_source_name}}",
      sub_id_1: "{{placement}}",
      sub_id_2: "{{campaign.id}}",
      sub_id_3: "{{adset.id}}",
      sub_id_4: "{{ad.id}}",
      sub_id_5: "{{ad.name}}",
      sub_id_6: "{{adset.name}}",
    },
  },
];

const emptyForm: SourceForm = {
  name: "",
  parameters: {},
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

export default function TrafficSourcesPage() {
  return <AppShell title="Traffic Sources">{() => <TrafficSourcesManagement />}</AppShell>;
}

function TrafficSourcesManagement() {
  const { t } = useI18n();
  const [sources, setSources] = useState<TrafficSource[]>([]);
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingSource, setEditingSource] = useState<TrafficSource | null>(null);
  const [form, setForm] = useState<SourceForm>(emptyForm);
  const [templateName, setTemplateName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const filteredSources = useMemo(() => {
    const normalizedSearch = search.toLowerCase().trim();
    return sources.filter((source) => source.name.toLowerCase().includes(normalizedSearch));
  }, [search, sources]);

  const loadSources = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      setSources(await apiRequest<TrafficSource[]>("/traffic-sources"));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not load traffic sources");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadSources();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadSources]);

  function openCreateModal() {
    setEditingSource(null);
    setForm(emptyForm);
    setTemplateName("");
    setError("");
    setModalOpen(true);
  }

  function openEditModal(source: TrafficSource) {
    setEditingSource(source);
    setForm({
      name: source.name,
      parameters: source.parameters ?? {},
      notes: source.notes ?? "",
    });
    setTemplateName("");
    setError("");
    setModalOpen(true);
  }

  function applyTemplate(name: string) {
    setTemplateName(name);
    const template = sourceTemplates.find((item) => item.name === name);
    if (!template) {
      return;
    }
    setForm({
      name: template.name,
      parameters: template.parameters,
      notes: "",
    });
  }

  function closeModal() {
    setModalOpen(false);
    setEditingSource(null);
    setForm(emptyForm);
    setTemplateName("");
  }

  async function saveSource() {
    if (!form.name.trim()) {
      setError("Source name is required");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const payload = {
        name: form.name,
        parameters: cleanupMap(form.parameters),
        notes: form.notes,
      };
      const saved = editingSource
        ? await apiRequest<TrafficSource>(`/traffic-sources/${editingSource.id}`, {
            method: "PATCH",
            body: JSON.stringify(payload),
          })
        : await apiRequest<TrafficSource>("/traffic-sources", {
            method: "POST",
            body: JSON.stringify(payload),
          });

      setSources((items) =>
        editingSource
          ? items.map((item) => (item.id === saved.id ? saved : item))
          : [saved, ...items],
      );
      closeModal();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not save traffic source");
    } finally {
      setSaving(false);
    }
  }

  async function deleteSource(source: TrafficSource) {
    const confirmed = window.confirm(`Delete ${source.name}?`);
    if (!confirmed) {
      return;
    }
    setError("");
    try {
      await apiRequest<void>(`/traffic-sources/${source.id}`, { method: "DELETE" });
      setSources((items) => items.filter((item) => item.id !== source.id));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not delete traffic source");
    }
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
        <Input
          className="h-9 w-64 rounded-md bg-white"
          placeholder={t("common.search")}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="icon-lg" className="rounded-md" onClick={() => void loadSources()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon-lg" className="rounded-md">
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="overflow-x-auto border border-neutral-200 bg-white shadow-sm">
        <table className="w-full min-w-[1180px] border-collapse text-left text-sm">
          <thead className="bg-neutral-50 text-neutral-500">
            <tr>
              <th className="h-10 w-10 border-b border-neutral-200 px-3 font-medium">
                <input className="size-4" type="checkbox" />
              </th>
              <th className="h-10 w-20 border-b border-neutral-200 px-3 font-medium">{t("common.id")}</th>
              <th className="h-10 border-b border-neutral-200 px-3 font-medium">{t("common.name")}</th>
              <th className="h-10 border-b border-neutral-200 px-3 font-medium">Parameters</th>
              <th className="h-10 border-b border-neutral-200 px-3 font-medium">Postback</th>
              <th className="h-10 w-28 border-b border-neutral-200 px-3 font-medium">Clicks</th>
              <th className="h-10 w-28 border-b border-neutral-200 px-3 font-medium">Cost</th>
              <th className="h-10 w-28 border-b border-neutral-200 px-3 font-medium">Leads</th>
              <th className="h-10 w-28 border-b border-neutral-200 px-3 font-medium">Sales</th>
              <th className="h-10 w-24 border-b border-neutral-200 px-3 text-right font-medium" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={10} className="h-20 px-3 text-neutral-500">
                  Loading traffic sources...
                </td>
              </tr>
            ) : filteredSources.length === 0 ? (
              <tr>
                <td colSpan={10} className="h-20 px-3 text-neutral-500">
                  No traffic sources yet.
                </td>
              </tr>
            ) : (
              filteredSources.map((source) => (
                <tr key={source.id} className="border-b border-neutral-200 last:border-0">
                  <td className="h-11 px-3"><input className="size-4" type="checkbox" /></td>
                  <td className="h-11 px-3 text-neutral-600">{source.id}</td>
                  <td className="h-11 px-3">
                    <button
                      className="font-medium text-blue-600 hover:text-blue-700 hover:underline"
                      onClick={() => openEditModal(source)}
                      type="button"
                    >
                      {source.name}
                    </button>
                  </td>
                  <td className="h-11 px-3 text-neutral-700">
                    {Object.keys(source.parameters ?? {}).length}
                  </td>
                  <td className="h-11 max-w-[360px] truncate px-3 text-neutral-500">
                    {source.postback_url || "-"}
                  </td>
                  <td className="h-11 px-3">0</td>
                  <td className="h-11 px-3">€0.0000</td>
                  <td className="h-11 px-3">0</td>
                  <td className="h-11 px-3">0</td>
                  <td className="h-11 px-3 text-right">
                    <Button
                      aria-label={`${t("actions.delete")} ${source.name}`}
                      size="icon-sm"
                      variant="ghost"
                      className="text-red-500 hover:bg-red-50 hover:text-red-600"
                      onClick={() => void deleteSource(source)}
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
              <td className="h-10 px-3">0</td>
              <td className="h-10 px-3">€0.0000</td>
              <td className="h-10 px-3">0</td>
              <td className="h-10 px-3">0</td>
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
          <span>1 - {filteredSources.length} of {sources.length}</span>
        </div>
        <Button variant="outline">{t("actions.export")}</Button>
      </div>

      {modalOpen && (
        <SourceModal
          editingSource={editingSource}
          error={error}
          form={form}
          saving={saving}
          templateName={templateName}
          setForm={setForm}
          onApplyTemplate={applyTemplate}
          onClose={closeModal}
          onSave={() => void saveSource()}
        />
      )}
    </div>
  );
}

function SourceModal({
  editingSource,
  error,
  form,
  saving,
  templateName,
  setForm,
  onApplyTemplate,
  onClose,
  onSave,
}: {
  editingSource: TrafficSource | null;
  error: string;
  form: SourceForm;
  saving: boolean;
  templateName: string;
  setForm: (form: SourceForm) => void;
  onApplyTemplate: (name: string) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const { t } = useI18n();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
      <div className="flex max-h-[calc(100vh-32px)] w-full max-w-6xl flex-col rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between px-8 py-6">
          <h2 className="text-2xl font-semibold tracking-normal">
            {editingSource ? "Edit Source" : "Create Source"}
          </h2>
          <div className="flex items-center gap-5">
            <Button aria-label={t("actions.close")} variant="ghost" size="icon-lg" onClick={onClose}>
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>

        <div className="flex-1 space-y-6 overflow-auto px-8 pb-6">
          {!editingSource && (
            <div className="space-y-2">
              <Label htmlFor="source-template">From template</Label>
              <Select
                id="source-template"
                value={templateName}
                onChange={(event) => onApplyTemplate(event.target.value)}
              >
                <option value="">Choose template</option>
                {sourceTemplates.map((template) => (
                  <option key={template.name} value={template.name}>
                    {template.name}
                  </option>
                ))}
              </Select>
            </div>
          )}

          <div className="max-w-md">
            <div className="space-y-2">
              <Label htmlFor="source-name">Name</Label>
              <Input
                id="source-name"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
              />
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-lg font-semibold tracking-normal">Parameters</h3>
            <div className="grid min-w-[820px] grid-cols-[minmax(160px,1fr)_minmax(180px,1fr)_28px_minmax(220px,1fr)] gap-3 text-sm">
              <div className="font-medium text-neutral-500">Name</div>
              <div className="font-medium text-neutral-500">Parameter</div>
              <div />
              <div className="font-medium text-neutral-500">Placeholder or value</div>
              {parameterRows.map(([label, parameter]) => (
                <div key={parameter} className="contents">
                  <Input readOnly value={label} className="bg-neutral-100 text-neutral-500" />
                  <Input readOnly value={parameter} className="text-right font-medium" />
                  <div className="flex items-center justify-center font-semibold text-neutral-500">=</div>
                  <Input
                    value={form.parameters[parameter] ?? ""}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        parameters: { ...form.parameters, [parameter]: event.target.value },
                      })
                    }
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="source-notes">Notes</Label>
            <textarea
              id="source-notes"
              className="min-h-24 w-full rounded-md border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              value={form.notes}
              onChange={(event) => setForm({ ...form, notes: event.target.value })}
            />
          </div>

          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-neutral-200 px-8 py-4">
          <Button variant="outline" onClick={onClose}>{t("actions.cancel")}</Button>
          <Button className="bg-[#45b84a] text-white hover:bg-[#3da442]" disabled={saving} onClick={onSave}>
            {editingSource ? t("actions.save") : t("actions.create")}
          </Button>
        </div>
      </div>
    </div>
  );
}

function cleanupMap(values: Record<string, string>) {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value.trim() !== ""));
}
