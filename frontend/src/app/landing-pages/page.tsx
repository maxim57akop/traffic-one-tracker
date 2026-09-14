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
  Save,
  Settings,
  Trash2,
  Upload,
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

type LandingStatus = "active" | "paused";

type Landing = {
  id: number;
  team_id: number;
  user_id: number;
  name: string;
  url: string;
  status: LandingStatus;
  group_name?: string;
  landing_type: "local";
  local_path: string;
  preview_url: string;
  files_count: number;
};

type LandingFile = {
  path: string;
  name: string;
  size: number;
  extension: string;
  editable: boolean;
};

type LandingForm = {
  name: string;
  groupName: string;
  folder: string;
  status: LandingStatus;
  zipFile: File | null;
};

const emptyForm: LandingForm = {
  name: "",
  groupName: "",
  folder: "",
  status: "active",
  zipFile: null,
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

export default function LandingPagesPage() {
  return <AppShell title="Landing Pages">{() => <LandingPagesManagement />}</AppShell>;
}

function LandingPagesManagement() {
  const { t } = useI18n();
  const [landings, setLandings] = useState<Landing[]>([]);
  const [search, setSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("today");
  const [form, setForm] = useState<LandingForm>(emptyForm);
  const [editingLanding, setEditingLanding] = useState<Landing | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);
  const [codeLanding, setCodeLanding] = useState<Landing | null>(null);
  const [files, setFiles] = useState<LandingFile[]>([]);
  const [selectedFile, setSelectedFile] = useState("");
  const [fileContent, setFileContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [codeSaving, setCodeSaving] = useState(false);
  const [error, setError] = useState("");

  const groups = useMemo(() => {
    const names = landings
      .map((landing) => landing.group_name?.trim())
      .filter((name): name is string => Boolean(name));
    return Array.from(new Set(names)).sort((a, b) => a.localeCompare(b));
  }, [landings]);

  const filteredLandings = useMemo(() => {
    const normalizedSearch = search.toLowerCase().trim();
    return landings.filter((landing) => {
      const matchesSearch =
        landing.name.toLowerCase().includes(normalizedSearch) ||
        landing.local_path.toLowerCase().includes(normalizedSearch);
      const matchesGroup = groupFilter === "all" || landing.group_name === groupFilter;
      const matchesStatus = statusFilter === "all" || landing.status === statusFilter;
      return matchesSearch && matchesGroup && matchesStatus;
    });
  }, [groupFilter, landings, search, statusFilter]);

  const totals = useMemo(
    () =>
      filteredLandings.reduce(
        (acc, landing) => ({
          clicks: acc.clicks,
          lpClicks: acc.lpClicks,
          files: acc.files + landing.files_count,
        }),
        { clicks: 0, lpClicks: 0, files: 0 },
      ),
    [filteredLandings],
  );

  const loadLandings = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const data = await apiRequest<Landing[]>("/landings");
      setLandings(data);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not load landing pages");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadLandings();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadLandings]);

  function openCreateModal() {
    setEditingLanding(null);
    setForm(emptyForm);
    setError("");
    setModalOpen(true);
  }

  function openEditModal(landing: Landing) {
    setEditingLanding(landing);
    setForm({
      name: landing.name,
      groupName: landing.group_name ?? "",
      folder: landing.local_path,
      status: landing.status,
      zipFile: null,
    });
    setError("");
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingLanding(null);
    setForm(emptyForm);
  }

  async function saveLanding() {
    if (!form.name.trim()) {
      setError("Name is required");
      return;
    }

    setSaving(true);
    setError("");
    try {
      if (editingLanding) {
        let updated: Landing;
        if (form.zipFile) {
          const payload = new FormData();
          payload.set("name", form.name);
          payload.set("group_name", form.groupName);
          payload.set("status", form.status);
          payload.set("zip", form.zipFile);
          updated = await apiFormRequest<Landing>(`/landings/${editingLanding.id}`, payload, "PATCH");
        } else {
          updated = await apiRequest<Landing>(`/landings/${editingLanding.id}`, {
            method: "PATCH",
            body: JSON.stringify({
              name: form.name,
              group_name: form.groupName,
              status: form.status,
            }),
          });
        }
        setLandings((items) => items.map((item) => (item.id === updated.id ? updated : item)));
      } else {
        let created: Landing;
        if (form.zipFile) {
          const payload = new FormData();
          payload.set("name", form.name);
          payload.set("group_name", form.groupName);
          payload.set("folder", form.folder);
          payload.set("status", form.status);
          payload.set("zip", form.zipFile);
          created = await apiFormRequest<Landing>("/landings", payload);
        } else {
          created = await apiRequest<Landing>("/landings", {
            method: "POST",
            body: JSON.stringify({
              name: form.name,
              group_name: form.groupName,
              folder: form.folder,
              status: form.status,
            }),
          });
        }
        setLandings((items) => [created, ...items]);
      }
      closeModal();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not save landing");
    } finally {
      setSaving(false);
    }
  }

  async function deleteLanding(landing: Landing) {
    const confirmed = window.confirm(`Delete ${landing.name} and local folder /lander/${landing.local_path}?`);
    if (!confirmed) {
      return;
    }

    setError("");
    try {
      await apiRequest<void>(`/landings/${landing.id}`, { method: "DELETE" });
      setLandings((items) => items.filter((item) => item.id !== landing.id));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not delete landing");
    }
  }

  async function openCode(landing: Landing) {
    setCodeLanding(landing);
    setCodeOpen(true);
    setFiles([]);
    setSelectedFile("");
    setFileContent("");
    setError("");

    try {
      const landingFiles = await apiRequest<LandingFile[]>(`/landings/${landing.id}/files`);
      setFiles(landingFiles);
      const firstEditable =
        landingFiles.find((file) => file.path === "index.html" && file.editable) ??
        landingFiles.find((file) => file.editable);
      if (firstEditable) {
        await selectFile(landing, firstEditable.path);
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not open code");
    }
  }

  async function selectFile(landing: Landing, path: string) {
    setSelectedFile(path);
    const data = await apiRequest<{ content: string }>(
      `/landings/${landing.id}/files/content?path=${encodeURIComponent(path)}`,
    );
    setFileContent(data.content);
  }

  async function saveCode() {
    if (!codeLanding || !selectedFile) {
      return;
    }

    setCodeSaving(true);
    setError("");
    try {
      await apiRequest(`/landings/${codeLanding.id}/files/content`, {
        method: "PATCH",
        body: JSON.stringify({ path: selectedFile, content: fileContent }),
      });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not save file");
    } finally {
      setCodeSaving(false);
    }
  }

  async function downloadLanding(landing: Landing) {
    const token = getAuthToken();
    const response = await fetch(`${API_URL}/landings/${landing.id}/download`, {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    if (!response.ok) {
      setError("Could not download landing");
      return;
    }

    const blob = await response.blob();
    const href = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = `${landing.local_path}.zip`;
    link.click();
    window.URL.revokeObjectURL(href);
  }

  function previewLanding(landing: Landing) {
    window.open(landing.preview_url, "_blank", "noopener,noreferrer");
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
        <Select
          className="h-9 w-52 rounded-md bg-white"
          value={groupFilter}
          onChange={(event) => setGroupFilter(event.target.value)}
        >
          <option value="all">{t("common.allGroups")}</option>
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
          <option value="all">{t("common.allStates")}</option>
          <option value="active">{t("common.active")}</option>
          <option value="paused">{t("common.paused")}</option>
        </Select>
        <Select
          className="h-9 w-52 rounded-md bg-white"
          value={dateFilter}
          onChange={(event) => setDateFilter(event.target.value)}
        >
          <option value="today">Today</option>
          <option value="yesterday">Yesterday</option>
          <option value="week">Last 7 days</option>
        </Select>
        <Button variant="outline" size="icon-lg" className="rounded-md" onClick={() => void loadLandings()}>
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
        <table className="w-full min-w-[1180px] border-collapse text-left text-sm">
          <thead className="bg-neutral-50 text-neutral-500">
            <tr>
              <th className="h-10 w-10 border-b border-neutral-200 px-3 font-medium">
                <input className="size-4" type="checkbox" />
              </th>
              <th className="h-10 w-20 border-b border-neutral-200 px-3 font-medium">{t("common.id")}</th>
              <th className="h-10 border-b border-neutral-200 px-3 font-medium">{t("common.name")}</th>
              <th className="h-10 border-b border-neutral-200 px-3 font-medium">{t("common.group")}</th>
              <th className="h-10 w-36 border-b border-neutral-200 px-3 font-medium">{t("common.actions")}</th>
              <th className="h-10 border-b border-neutral-200 px-3 font-medium">{t("landing.clicks")}</th>
              <th className="h-10 border-b border-neutral-200 px-3 font-medium">{t("landing.lpClicks")}</th>
              <th className="h-10 border-b border-neutral-200 px-3 font-medium">{t("landing.lpCtr")}</th>
              <th className="h-10 border-b border-neutral-200 px-3 font-medium">Conv.</th>
              <th className="h-10 border-b border-neutral-200 px-3 font-medium">{t("common.cr")}</th>
              <th className="h-10 border-b border-neutral-200 px-3 font-medium">EPC (confirmed)</th>
              <th className="h-10 border-b border-neutral-200 px-3 font-medium">{t("common.cpc")}</th>
              <th className="h-10 w-20 border-b border-neutral-200 px-3 text-right font-medium" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={13} className="h-20 px-3 text-neutral-500">
                  {t("landing.loading")}
                </td>
              </tr>
            ) : filteredLandings.length === 0 ? (
              <tr>
                <td colSpan={13} className="h-20 px-3 text-neutral-500">
                  {t("landing.noItems")}
                </td>
              </tr>
            ) : (
              filteredLandings.map((landing) => (
                <tr key={landing.id} className="border-b border-neutral-200 last:border-0">
                  <td className="h-11 px-3">
                    <input className="size-4" type="checkbox" />
                  </td>
                  <td className="h-11 px-3 text-neutral-600">{landing.id}</td>
                  <td className="h-11 px-3">
                    <button
                      className="font-medium text-blue-600 hover:text-blue-700 hover:underline"
                      onClick={() => openEditModal(landing)}
                      type="button"
                    >
                      {landing.name}
                    </button>
                  </td>
                  <td className="h-11 px-3 text-neutral-700">{landing.group_name ?? "-"}</td>
                  <td className="h-11 px-3">
                    <div className="flex items-center gap-1">
                      <IconAction label={t("actions.preview")} onClick={() => previewLanding(landing)}>
                        <ExternalLink className="h-4 w-4" />
                      </IconAction>
                      <IconAction label={t("landing.code")} onClick={() => void openCode(landing)}>
                        <Code2 className="h-4 w-4" />
                      </IconAction>
                      <IconAction label={t("actions.download")} onClick={() => void downloadLanding(landing)}>
                        <Download className="h-4 w-4" />
                      </IconAction>
                    </div>
                  </td>
                  <td className="h-11 px-3">0</td>
                  <td className="h-11 px-3">0</td>
                  <td className="h-11 px-3">0.00%</td>
                  <td className="h-11 px-3">0</td>
                  <td className="h-11 px-3">0.00%</td>
                  <td className="h-11 px-3">€0.0000</td>
                  <td className="h-11 px-3">€0.0000</td>
                  <td className="h-11 px-3 text-right">
                    <Button
                      aria-label={`${t("actions.delete")} ${landing.name}`}
                      size="icon-sm"
                      variant="ghost"
                      className="text-red-500 hover:bg-red-50 hover:text-red-600"
                      onClick={() => void deleteLanding(landing)}
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
              <td className="h-10 px-3">{totals.files} {t("landing.files")}</td>
              <td className="h-10 px-3">{totals.clicks}</td>
              <td className="h-10 px-3">{totals.lpClicks}</td>
              <td className="h-10 px-3">0.00%</td>
              <td className="h-10 px-3">0</td>
              <td className="h-10 px-3">0.00%</td>
              <td className="h-10 px-3">€0.0000</td>
              <td className="h-10 px-3">€0.0000</td>
              <td className="h-10 px-3" />
            </tr>
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <LandingModal
          editingLanding={editingLanding}
          error={error}
          form={form}
          saving={saving}
          setForm={setForm}
          onClose={closeModal}
          onSave={() => void saveLanding()}
        />
      )}

      {codeOpen && codeLanding && (
        <CodeEditor
          content={fileContent}
          files={files}
          landing={codeLanding}
          saving={codeSaving}
          selectedFile={selectedFile}
          setContent={setFileContent}
          onClose={() => setCodeOpen(false)}
          onSave={() => void saveCode()}
          onSelectFile={(path) => void selectFile(codeLanding, path)}
        />
      )}
    </div>
  );
}

function LandingModal({
  editingLanding,
  error,
  form,
  saving,
  setForm,
  onClose,
  onSave,
}: {
  editingLanding: Landing | null;
  error: string;
  form: LandingForm;
  saving: boolean;
  setForm: (form: LandingForm) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const { t } = useI18n();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
      <div className="max-h-[calc(100vh-32px)] w-full max-w-5xl overflow-auto rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between px-8 py-6">
          <h2 className="text-2xl font-semibold tracking-normal">
            {editingLanding ? t("landing.editTitle") : t("landing.createTitle")}
          </h2>
          <Button aria-label={t("actions.close")} variant="ghost" size="icon-lg" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="space-y-7 px-8 pb-8">
          <div className="space-y-2">
            <Label htmlFor="landing-name">{t("common.name")}</Label>
            <Input
              id="landing-name"
              placeholder={t("landing.namePlaceholder")}
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="landing-group">{t("common.group")}</Label>
            <Input
              id="landing-group"
                placeholder={t("common.typeSearchCreate")}
              value={form.groupName}
              onChange={(event) => setForm({ ...form, groupName: event.target.value })}
            />
          </div>

          <div className="flex flex-wrap gap-8">
            <label className="inline-flex items-center gap-2 text-sm font-medium">
              <input checked className="size-4 accent-blue-500" readOnly type="radio" />
              Local
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-neutral-400">
              <input className="size-4" disabled type="radio" />
              Redirect
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-neutral-400">
              <input className="size-4" disabled type="radio" />
              Preload
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-neutral-400">
              <input className="size-4" disabled type="radio" />
              Action
            </label>
          </div>

          <div className="space-y-2">
            <Label>{t("landing.zipFile")}</Label>
            <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-md border border-neutral-200 bg-white px-4 text-sm font-medium shadow-sm hover:bg-neutral-50">
              <Upload className="h-4 w-4" />
              {t("landing.chooseFile")}
              <input
                className="sr-only"
                type="file"
                accept=".zip,application/zip,application/x-zip-compressed"
                onChange={(event) =>
                  setForm({ ...form, zipFile: event.target.files?.[0] ?? null })
                }
              />
            </label>
            <p className="text-sm text-neutral-400">
              {form.zipFile ? form.zipFile.name : t("landing.uploadHint")}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="landing-folder">{t("landing.folder")}</Label>
            <div className="flex">
              <span className="inline-flex h-9 items-center rounded-l-md border border-r-0 border-neutral-200 bg-neutral-50 px-3 text-sm text-neutral-500">
                /lander/
              </span>
              <Input
                id="landing-folder"
                className="rounded-l-none"
                disabled={Boolean(editingLanding)}
                placeholder={t("landing.folderPlaceholder")}
                value={form.folder}
                onChange={(event) => setForm({ ...form, folder: event.target.value })}
              />
            </div>
          </div>

          <div className="rounded-md border-2 border-violet-400 px-5 py-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-semibold tracking-normal">{t("landing.offerLink")}</h3>
                <p className="mt-3 text-sm text-neutral-600">
                  {t("landing.offerDescription")}
                </p>
              </div>
            </div>
            <div className="mt-4 flex h-10 items-center justify-between rounded-md border border-neutral-200 bg-white px-3 font-mono text-sm">
              {t("landing.offerCode")}
            </div>
          </div>

          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-neutral-200 px-8 py-4">
          <Button variant="outline" onClick={onClose}>
            {t("actions.cancel")}
          </Button>
          <Button className="bg-[#45b84a] text-white hover:bg-[#3da442]" disabled={saving} onClick={onSave}>
            {editingLanding ? t("actions.save") : t("actions.create")}
          </Button>
        </div>
      </div>
    </div>
  );
}

function CodeEditor({
  content,
  files,
  landing,
  saving,
  selectedFile,
  setContent,
  onClose,
  onSave,
  onSelectFile,
}: {
  content: string;
  files: LandingFile[];
  landing: Landing;
  saving: boolean;
  selectedFile: string;
  setContent: (content: string) => void;
  onClose: () => void;
  onSave: () => void;
  onSelectFile: (path: string) => void;
}) {
  const { t } = useI18n();

  return (
    <div className="fixed inset-0 z-50 bg-white text-neutral-950">
      <div className="flex h-12 items-center justify-between border-b border-neutral-200 px-4">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled>
            {t("actions.createFile")}
          </Button>
          <Button variant="outline" size="sm" disabled>
            {t("actions.uploadFile")}
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button className="bg-[#45b84a] text-white hover:bg-[#3da442]" disabled={saving || !selectedFile} onClick={onSave}>
            <Save className="h-4 w-4" />
            {t("actions.save")}
          </Button>
          <Button aria-label={t("actions.close")} variant="ghost" size="icon-sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="grid h-[calc(100vh-48px)] grid-cols-[320px_1fr]">
        <aside className="border-r border-neutral-200 bg-neutral-50">
          <div className="border-b border-neutral-200 px-4 py-3">
            <div className="font-medium">{landing.name}</div>
            <div className="text-xs text-neutral-500">/lander/{landing.local_path}</div>
          </div>
          <div className="divide-y divide-neutral-200">
            {files.length === 0 ? (
              <div className="px-4 py-6 text-sm text-neutral-500">{t("landing.noFiles")}</div>
            ) : (
              files.map((file) => (
                <button
                  key={file.path}
                  className={[
                    "flex w-full items-center gap-3 px-4 py-3 text-left text-sm",
                    selectedFile === file.path ? "bg-white text-blue-600" : "hover:bg-white",
                    !file.editable ? "cursor-not-allowed opacity-50" : "",
                  ].join(" ")}
                  disabled={!file.editable}
                  onClick={() => onSelectFile(file.path)}
                  type="button"
                >
                  <FileText className="h-4 w-4" />
                  <span className="min-w-0 flex-1 truncate">{file.path}</span>
                  <span className="text-xs text-neutral-400">{formatSize(file.size)}</span>
                </button>
              ))
            )}
          </div>
        </aside>
        <section className="flex min-w-0 flex-col">
          <div className="flex h-12 items-center gap-2 border-b border-neutral-200 px-4 text-sm text-neutral-500">
            <span>{landing.name}</span>
            <span>›</span>
            <span className="font-medium text-neutral-800">{selectedFile || t("landing.noEditableFile")}</span>
          </div>
          <textarea
            className="h-full w-full flex-1 resize-none bg-white px-6 py-4 font-mono text-sm leading-6 outline-none"
            disabled={!selectedFile}
            spellCheck={false}
            value={fileContentValue(content, selectedFile)}
            onChange={(event) => setContent(event.target.value)}
          />
        </section>
      </div>
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

function formatSize(size: number) {
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${Math.round(size / 1024)} KB`;
  }
  return `${Math.round(size / 1024 / 1024)} MB`;
}

function fileContentValue(content: string, selectedFile: string) {
  if (!selectedFile) {
    return "";
  }
  return content;
}
