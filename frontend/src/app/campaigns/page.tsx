"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import { useRouter } from "next/navigation";
import {
  BarChart3,
  ChevronDown,
  FileText,
  GripVertical,
  Link2,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Settings,
  Star,
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
const TRACKER_URL = process.env.NEXT_PUBLIC_TRACKER_URL ?? "http://127.0.0.1:8080";

type CampaignStatus = "draft" | "active" | "paused";
type CampaignTab = "general" | "parameters" | "notes";
type FlowTab = "main" | "schema" | "filters" | "monitoring" | "notes";
type FlowType = "regular" | "default" | "forced";
type DestinationType = "offer" | "landing" | "url";
type CampaignToastKind = "success" | "error" | "info";

type Campaign = {
  id: number;
  team_id: number;
  user_id: number;
  name: string;
  slug: string;
  domain_id?: number;
  domain_name?: string;
  traffic_source_id?: number;
  alias: string;
  group_name?: string;
  source_name?: string;
  flow_rotation: "position" | "weight";
  cost_model: "cpc" | "cpm";
  cost_value: number;
  cost_currency: string;
  cost_from_param: boolean;
  traffic_loss: number;
  uniqueness: "ip_ua" | "ip" | "parameter";
  use_cookies: boolean;
  uniqueness_ttl_hours: number;
  api_token: string;
  parameters: Record<string, string>;
  s2s_postbacks: Record<string, string>;
  notes?: string;
  status: CampaignStatus;
};

type CampaignStats = {
  campaign_id: number;
  clicks: number;
  unique_campaign: number;
  conversions: number;
  cost: number;
  revenue: number;
};

type Domain = {
  id: number;
  domain: string;
  status: string;
};

type Offer = {
  id: number;
  name: string;
};

type Landing = {
  id: number;
  name: string;
};

type TrafficSource = {
  id: number;
  name: string;
  postback_url?: string;
  parameters: Record<string, string>;
};

type Flow = {
  id: number;
  campaign_id: number;
  name: string;
  flow_type: FlowType;
  position: number;
  collect_clicks: boolean;
  status: "active" | "paused";
  notes?: string;
};

type Stream = {
  id: number;
  flow_id: number;
  name: string;
  position: number;
  status: "active" | "paused";
};

type StreamDestination = {
  id: number;
  stream_id: number;
  destination_type: DestinationType;
  destination_id?: number;
  url?: string;
  weight: number;
  status: "active" | "paused";
};

type CampaignForm = {
  name: string;
  domainId: string;
  alias: string;
  groupName: string;
  sourceId: string;
  sourceName: string;
  flowRotation: "position" | "weight";
  costModel: "cpc" | "cpm";
  costValue: string;
  costCurrency: string;
  costFromParam: boolean;
  trafficLoss: string;
  uniqueness: "ip_ua" | "ip" | "parameter";
  useCookies: boolean;
  uniquenessTtlHours: string;
  parameters: Record<string, string>;
  s2sPostbacks: Record<string, string>;
  notes: string;
  status: "active" | "paused";
};

type CampaignToast = {
  id: number;
  kind: CampaignToastKind;
  title: string;
  description?: string;
};

type FlowForm = {
  name: string;
  flowType: FlowType;
  position: string;
  collectClicks: boolean;
  status: "active" | "paused";
  destinationType: DestinationType;
  destinationId: string;
  url: string;
  weight: string;
  notes: string;
};

const parameterRows = [
  ["Keyword", "keyword"],
  ["Cost", "cost"],
  ["Currency", "currency"],
  ["External ID", "external_id"],
  ["Creative ID", "creative_id"],
  ["Ad Campaign ID", "ad_campaign_id"],
  ["Site", "source"],
  ...Array.from({ length: 30 }, (_, index) => [`Sub Id ${index + 1}`, `sub_id_${index + 1}`]),
];

const copy = {
  en: {
    actions: "Actions",
    allGroups: "All groups",
    allSources: "All sources",
    allStates: "All states",
    apiToken: "API token",
    campaignName: "Campaign name",
    campaigns: "Campaigns",
    collectClicks: "Collect clicks",
    conversion: "Conv.",
    cost: "Cost",
    costModel: "Cost model",
    costValue: "Cost value",
    createCampaign: "Create campaign",
    createFlow: "Create Flow",
    campaignCreated: "Campaign created",
    campaignSaved: "Campaign saved",
    compileStarted: "Campaign compiled",
    destination: "Destination",
    domain: "Domain",
    emptyFlows: "There are no flows yet.",
    flowName: "Flow name",
    flowRotation: "Flow rotation",
    flowType: "Flow type",
    flows: "Flows",
    fromCost: "From 'cost' parameter",
    general: "General",
    group: "Group",
    linkCopied: "Link copied",
    linkCopyFailed: "Could not copy link",
    monitoring: "Monitoring",
    noCampaigns: "No campaigns yet.",
    notes: "Notes",
    parameters: "Parameters",
    profit: "Profit/Loss",
    revenue: "Revenue",
    schema: "Schema",
    source: "Source",
    flowCreated: "Flow created",
    flowSaved: "Flow saved",
    editFlow: "Edit Flow",
    trafficLoss: "Traffic loss",
    uniqueness: "Uniqueness",
    uniquenessTtl: "Uniqueness TTL",
  },
  ru: {
    actions: "Действия",
    allGroups: "Все группы",
    allSources: "Все источники",
    allStates: "Все состояния",
    apiToken: "API токен",
    campaignName: "Название кампании",
    campaigns: "Кампании",
    collectClicks: "Собирать клики",
    conversion: "Конв.",
    cost: "Расход",
    costModel: "Модель расхода",
    costValue: "Значение расхода",
    createCampaign: "Создать кампанию",
    createFlow: "Создать Flow",
    campaignCreated: "Кампания создана",
    campaignSaved: "Кампания сохранена",
    compileStarted: "Кампания скомпилирована",
    destination: "Назначение",
    domain: "Домен",
    emptyFlows: "Потоков пока нет.",
    flowName: "Название flow",
    flowRotation: "Ротация flow",
    flowType: "Тип flow",
    flows: "Flows",
    fromCost: "Из параметра 'cost'",
    general: "Основное",
    group: "Группа",
    linkCopied: "Ссылка скопирована",
    linkCopyFailed: "Не удалось скопировать ссылку",
    monitoring: "Мониторинг",
    noCampaigns: "Кампаний пока нет.",
    notes: "Заметки",
    parameters: "Параметры",
    profit: "Прибыль/Убыток",
    revenue: "Доход",
    schema: "Схема",
    source: "Источник",
    flowCreated: "Flow создан",
    flowSaved: "Flow сохранен",
    editFlow: "Редактировать Flow",
    trafficLoss: "Потеря трафика",
    uniqueness: "Уникальность",
    uniquenessTtl: "TTL уникальности",
  },
  uk: {
    actions: "Дії",
    allGroups: "Усі групи",
    allSources: "Усі джерела",
    allStates: "Усі стани",
    apiToken: "API токен",
    campaignName: "Назва кампанії",
    campaigns: "Кампанії",
    collectClicks: "Збирати кліки",
    conversion: "Конв.",
    cost: "Витрати",
    costModel: "Модель витрат",
    costValue: "Значення витрат",
    createCampaign: "Створити кампанію",
    createFlow: "Створити Flow",
    campaignCreated: "Кампанію створено",
    campaignSaved: "Кампанію збережено",
    compileStarted: "Кампанію скомпільовано",
    destination: "Призначення",
    domain: "Домен",
    emptyFlows: "Потоків поки немає.",
    flowName: "Назва flow",
    flowRotation: "Ротація flow",
    flowType: "Тип flow",
    flows: "Flows",
    fromCost: "З параметра 'cost'",
    general: "Основне",
    group: "Група",
    linkCopied: "Посилання скопійовано",
    linkCopyFailed: "Не вдалося скопіювати посилання",
    monitoring: "Моніторинг",
    noCampaigns: "Кампаній поки немає.",
    notes: "Нотатки",
    parameters: "Параметри",
    profit: "Прибуток/Збиток",
    revenue: "Дохід",
    schema: "Схема",
    source: "Джерело",
    flowCreated: "Flow створено",
    flowSaved: "Flow збережено",
    editFlow: "Редагувати Flow",
    trafficLoss: "Втрата трафіку",
    uniqueness: "Унікальність",
    uniquenessTtl: "TTL унікальності",
  },
};

const emptyCampaignForm: CampaignForm = {
  name: "",
  domainId: "",
  alias: "",
  groupName: "",
  sourceId: "",
  sourceName: "",
  flowRotation: "position",
  costModel: "cpc",
  costValue: "0",
  costCurrency: "EUR",
  costFromParam: true,
  trafficLoss: "0",
  uniqueness: "ip_ua",
  useCookies: true,
  uniquenessTtlHours: "24",
  parameters: {},
  s2sPostbacks: {},
  notes: "",
  status: "active",
};

const emptyFlowForm: FlowForm = {
  name: "Flow 1",
  flowType: "regular",
  position: "1",
  collectClicks: true,
  status: "active",
  destinationType: "offer",
  destinationId: "",
  url: "",
  weight: "100",
  notes: "",
};

type CampaignsManagementProps = {
  detailMode?: boolean;
  initialCampaignId?: number;
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

export default function CampaignsPage() {
  return <AppShell title="Campaigns">{() => <CampaignsManagement />}</AppShell>;
}

export function CampaignsManagement({ detailMode = false, initialCampaignId }: CampaignsManagementProps = {}) {
  const router = useRouter();
  const { language, t } = useI18n();
  const c = copy[language as keyof typeof copy] ?? copy.en;
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [trafficSources, setTrafficSources] = useState<TrafficSource[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [landings, setLandings] = useState<Landing[]>([]);
  const [flows, setFlows] = useState<Flow[]>([]);
  const [streams, setStreams] = useState<Stream[]>([]);
  const [destinations, setDestinations] = useState<StreamDestination[]>([]);
  const [campaignStats, setCampaignStats] = useState<Record<number, CampaignStats>>({});
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [groupFilter, setGroupFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("today");
  const [editorOpen, setEditorOpen] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [campaignForm, setCampaignForm] = useState<CampaignForm>(emptyCampaignForm);
  const [activeTab, setActiveTab] = useState<CampaignTab>("general");
  const [flowModalOpen, setFlowModalOpen] = useState(false);
  const [flowTab, setFlowTab] = useState<FlowTab>("main");
  const [flowForm, setFlowForm] = useState<FlowForm>(emptyFlowForm);
  const [editingFlow, setEditingFlow] = useState<Flow | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState<CampaignToast | null>(null);

  const groups = useMemo(() => uniqueSorted(campaigns.map((campaign) => campaign.group_name)), [campaigns]);
  const sources = useMemo(() => uniqueSorted(campaigns.map((campaign) => campaign.source_name)), [campaigns]);

  const visibleCampaigns = useMemo(() => {
    const normalizedSearch = search.toLowerCase().trim();
    return campaigns.filter((campaign) => {
      const matchesSearch =
        campaign.name.toLowerCase().includes(normalizedSearch) ||
        campaign.alias.toLowerCase().includes(normalizedSearch) ||
        campaign.slug.toLowerCase().includes(normalizedSearch);
      const matchesSource = sourceFilter === "all" || campaign.source_name === sourceFilter;
      const matchesGroup = groupFilter === "all" || campaign.group_name === groupFilter;
      const matchesStatus = statusFilter === "all" || campaign.status === statusFilter;
      return matchesSearch && matchesSource && matchesGroup && matchesStatus;
    });
  }, [campaigns, groupFilter, search, sourceFilter, statusFilter]);

  const selectedFlows = useMemo(
    () => flows.filter((flow) => flow.campaign_id === selectedCampaign?.id),
    [flows, selectedCampaign],
  );

  const totals = useMemo(
    () =>
      visibleCampaigns.reduce(
        (sum, campaign) => {
          const stats = statsForCampaign(campaign.id, campaignStats);
          sum.flows += flowCount(campaign.id, flows);
          sum.clicks += stats.clicks;
          sum.conversions += stats.conversions;
          sum.cost += stats.cost;
          sum.revenue += stats.revenue;
          return sum;
        },
        { flows: 0, clicks: 0, conversions: 0, cost: 0, revenue: 0 },
      ),
    [campaignStats, flows, visibleCampaigns],
  );

  const loadData = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const [campaignData, domainData, sourceData, offerData, landingData, flowData, streamData, destinationData, statsData] =
        await Promise.all([
          apiRequest<Campaign[]>("/campaigns"),
          apiRequest<Domain[]>("/domains"),
          apiRequest<TrafficSource[]>("/traffic-sources"),
          apiRequest<Offer[]>("/offers"),
          apiRequest<Landing[]>("/landings"),
          apiRequest<Flow[]>("/flows"),
          apiRequest<Stream[]>("/streams"),
          apiRequest<StreamDestination[]>("/stream-destinations"),
          apiRequest<CampaignStats[]>(`/campaigns/stats?date=${dateFilter}`),
        ]);
      setCampaigns(campaignData);
      setDomains(domainData);
      setTrafficSources(sourceData);
      setOffers(offerData);
      setLandings(landingData);
      setFlows(flowData);
      setStreams(streamData);
      setDestinations(destinationData);
      setCampaignStats(Object.fromEntries(statsData.map((item) => [item.campaign_id, item])));
      if (initialCampaignId) {
        const initialCampaign = campaignData.find((campaign) => campaign.id === initialCampaignId) ?? null;
        setSelectedCampaign(initialCampaign);
        setEditorOpen(Boolean(initialCampaign));
        if (initialCampaign) {
          setCampaignForm(campaignToForm(initialCampaign));
          setActiveTab("general");
        } else if (detailMode) {
          setError("Campaign not found");
        }
        return;
      }
      setSelectedCampaign((current) => {
        const campaign = current ? campaignData.find((item) => item.id === current.id) ?? current : current;
        if (campaign) {
          setCampaignForm(campaignToForm(campaign));
        }
        return campaign;
      });
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "Could not load campaigns";
      setError(message);
      showToast("error", message);
    } finally {
      setLoading(false);
    }
  }, [dateFilter, detailMode, initialCampaignId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadData();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadData]);

  function openCreateEditor() {
    setEditorOpen(true);
    setSelectedCampaign(null);
    setCampaignForm({ ...emptyCampaignForm, alias: generateAlias() });
    setActiveTab("general");
    setError("");
  }

  function openCampaign(campaign: Campaign) {
    if (!detailMode) {
      router.push(`/campaign/${campaign.id}/main`);
      return;
    }
    setEditorOpen(true);
    setSelectedCampaign(campaign);
    setCampaignForm(campaignToForm(campaign));
    setActiveTab("general");
    setError("");
  }

  function closeEditor() {
    if (detailMode) {
      router.push("/campaigns");
      return;
    }
    setEditorOpen(false);
    setSelectedCampaign(null);
    setCampaignForm(emptyCampaignForm);
    setActiveTab("general");
  }

  function showToast(kind: CampaignToastKind, title: string, description?: string) {
    const id = Date.now();
    setToast({ id, kind, title, description });
    window.setTimeout(() => {
      setToast((current) => (current?.id === id ? null : current));
    }, 2600);
  }

  async function saveCampaign(): Promise<Campaign | null> {
    if (!campaignForm.name.trim()) {
      const message = `${c.campaignName}: required`;
      setError(message);
      showToast("error", message);
      return null;
    }

    setSaving(true);
    setError("");
    const isEditing = Boolean(selectedCampaign);
    try {
      const payload = formToPayload(campaignForm);
      const saved = selectedCampaign
        ? await apiRequest<Campaign>(`/campaigns/${selectedCampaign.id}`, {
            method: "PATCH",
            body: JSON.stringify(payload),
          })
        : await apiRequest<Campaign>("/campaigns", {
            method: "POST",
            body: JSON.stringify(payload),
          });

      setCampaigns((items) => {
        const exists = items.some((item) => item.id === saved.id);
        return exists ? items.map((item) => (item.id === saved.id ? saved : item)) : [saved, ...items];
      });
      setSelectedCampaign(saved);
      setEditorOpen(true);
      setCampaignForm(campaignToForm(saved));
      showToast("success", isEditing ? c.campaignSaved : c.campaignCreated);
      return saved;
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "Could not save campaign";
      setError(message);
      showToast("error", message);
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function compileCampaign(campaign: Campaign) {
    setError("");
    try {
      await apiRequest(`/campaigns/${campaign.id}/compile`, { method: "POST" });
      showToast("success", c.compileStarted, campaign.name);
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "Could not compile campaign";
      setError(message);
      showToast("error", message);
    }
  }

  async function copyCampaignLink(campaign: Campaign) {
    const url = campaignTrackerURL(campaign);
    try {
      await navigator.clipboard.writeText(url);
      showToast("success", c.linkCopied, url);
    } catch {
      showToast("error", c.linkCopyFailed, url);
    }
  }

  async function openFlowModal() {
    if (!selectedCampaign) {
      const saved = await saveCampaign();
      if (!saved) {
        return;
      }
    }
    setFlowForm({
      ...emptyFlowForm,
      name: `Flow ${selectedFlows.length + 1}`,
      position: String(selectedFlows.length + 1),
    });
    setEditingFlow(null);
    setFlowTab("main");
    setError("");
    setFlowModalOpen(true);
  }

  function openEditFlow(flow: Flow) {
    setEditingFlow(flow);
    setFlowForm(flowToForm(flow, streams, destinations));
    setFlowTab("main");
    setError("");
    setFlowModalOpen(true);
  }

  async function saveFlow() {
    if (!selectedCampaign) {
      setError("Save campaign first");
      showToast("error", "Save campaign first");
      return;
    }
    if (!flowForm.name.trim()) {
      const message = `${c.flowName}: required`;
      setError(message);
      showToast("error", message);
      return;
    }
    if (flowForm.destinationType === "url" && !flowForm.url.trim()) {
      setError("URL is required");
      showToast("error", "URL is required");
      return;
    }
    if (flowForm.destinationType !== "url" && !flowForm.destinationId) {
      const message = `${c.destination}: required`;
      setError(message);
      showToast("error", message);
      return;
    }

    setSaving(true);
    setError("");
    try {
      if (editingFlow) {
        const flow = await apiRequest<Flow>(`/flows/${editingFlow.id}`, {
          method: "PATCH",
          body: JSON.stringify(flowPayload(flowForm, selectedFlows.length + 1)),
        });
        const { stream, destination } = await saveFlowDestination(flow, flowForm, streams, destinations);

        setFlows((items) => items.map((item) => (item.id === flow.id ? flow : item)));
        if (stream) {
          setStreams((items) => (items.some((item) => item.id === stream.id) ? items : [...items, stream]));
        }
        if (destination) {
          setDestinations((items) => {
            const exists = items.some((item) => item.id === destination.id);
            return exists ? items.map((item) => (item.id === destination.id ? destination : item)) : [...items, destination];
          });
        }
        setFlowModalOpen(false);
        setEditingFlow(null);
        showToast("success", c.flowSaved, flow.name);
        return;
      }

      const flow = await apiRequest<Flow>("/flows", {
        method: "POST",
        body: JSON.stringify({ campaign_id: selectedCampaign.id, ...flowPayload(flowForm, selectedFlows.length + 1) }),
      });
      const stream = await apiRequest<Stream>("/streams", {
        method: "POST",
        body: JSON.stringify({
          flow_id: flow.id,
          name: `${flow.name} stream`,
          position: 1,
          status: "active",
        }),
      });
      const destination = await apiRequest<StreamDestination>("/stream-destinations", {
        method: "POST",
        body: JSON.stringify({ stream_id: stream.id, ...destinationPayload(flowForm) }),
      });

      setFlows((items) => [...items, flow]);
      setStreams((items) => [...items, stream]);
      setDestinations((items) => [...items, destination]);
      setFlowModalOpen(false);
      showToast("success", c.flowCreated, flow.name);
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : editingFlow ? "Could not save flow" : "Could not create flow";
      setError(message);
      showToast("error", message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-w-0">
      {toast ? <CampaignToastView toast={toast} /> : null}
      {editorOpen ? (
        <div className="min-h-[calc(100vh-9rem)] bg-white dark:bg-neutral-950">
          <div className="flex items-center gap-3 border-b bg-neutral-50 px-5 py-4 dark:border-neutral-800 dark:bg-neutral-950">
            <Input
              autoFocus={!selectedCampaign}
              className={`h-12 max-w-[760px] text-xl ${error && !campaignForm.name.trim() ? "border-red-500 ring-2 ring-red-100" : ""}`}
              placeholder={c.campaignName}
              value={campaignForm.name}
              onChange={(event) => setCampaignForm((form) => ({ ...form, name: event.target.value }))}
            />
            <div className="ml-auto flex items-center gap-2">
              <Button disabled={saving || !campaignForm.name.trim()} onClick={saveCampaign}>
                {selectedCampaign ? t("actions.save") : t("actions.create")}
              </Button>
              {selectedCampaign ? (
                <>
                  <Button variant="outline" size="icon" onClick={() => void copyCampaignLink(selectedCampaign)}>
                    <Link2 className="size-4" />
                  </Button>
                  <Button variant="outline" onClick={() => void compileCampaign(selectedCampaign)}>
                    Log
                  </Button>
                </>
              ) : null}
              <Button variant="ghost" size="icon" onClick={closeEditor}>
                <X className="size-5" />
              </Button>
            </div>
          </div>
          {error ? <div className="px-5 pt-3 text-sm text-red-500">{error}</div> : null}

          <div className="grid min-h-[calc(100vh-14rem)] grid-cols-[minmax(420px,46%)_minmax(520px,1fr)]">
            <section className="border-r dark:border-neutral-800">
	              <Tabs
	                items={[
	                  ["general", c.general],
	                  ["parameters", c.parameters],
	                  ["notes", c.notes],
	                ]}
                value={activeTab}
                onChange={(value) => setActiveTab(value as CampaignTab)}
              />
              <div className="max-h-[calc(100vh-17.5rem)] overflow-auto p-5">
                {activeTab === "general" ? (
                  <GeneralTab
                    c={c}
                    domains={domains}
                    trafficSources={trafficSources}
                    form={campaignForm}
                    setForm={setCampaignForm}
                  />
                ) : null}
	                {activeTab === "parameters" ? <ParametersTab form={campaignForm} setForm={setCampaignForm} /> : null}
                {activeTab === "notes" ? (
                  <textarea
                    className="min-h-64 w-full rounded-md border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                    value={campaignForm.notes}
                    onChange={(event) => setCampaignForm((form) => ({ ...form, notes: event.target.value }))}
                  />
                ) : null}
              </div>
            </section>

            <section className="min-w-0 p-5">
              <div className="flex items-center gap-3">
                <button
                  className="inline-flex h-10 overflow-hidden rounded-md bg-[#59bf5f] text-sm font-semibold text-white shadow-sm transition hover:bg-[#4caf54] disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={saving || (!selectedCampaign && !campaignForm.name.trim())}
                  onClick={() => void openFlowModal()}
                >
                  <span className="flex items-center px-4">{c.createFlow}</span>
                  <span className="flex w-10 items-center justify-center border-l border-white/25 bg-black/5">
                    <ChevronDown className="size-4" />
                  </span>
                </button>
                <div className="ml-auto flex items-center gap-2">
                  <Button variant="outline" size="icon">
                    <ChevronDown className="size-4 rotate-180" />
                  </Button>
                  <Select className="h-10 w-44" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)}>
                    <option value="today">{t("common.today")}</option>
                    <option value="yesterday">{t("common.yesterday")}</option>
                    <option value="last7">{t("common.last7Days")}</option>
                  </Select>
                  <Button variant="outline" size="icon" onClick={() => void loadData()}>
                    <RefreshCw className="size-4" />
                  </Button>
                </div>
              </div>

              <div className="mt-10 text-center text-lg text-muted-foreground">
                {selectedFlows.length === 0 ? (
                  c.emptyFlows
                ) : (
                  <div className="overflow-hidden text-left">
                    <table className="w-full text-sm">
                      <thead className="border-b border-neutral-200 text-neutral-500 dark:border-neutral-800">
                        <tr className="h-12">
                          <th className="w-10 px-2"></th>
                          <th className="w-12 px-2">
                            <input className="size-4 rounded border-neutral-300" type="checkbox" aria-label="Select all flows" />
                          </th>
                          <th className="w-28 px-3 text-left text-base font-medium">ID</th>
                          <th className="px-3 text-left"></th>
                          <th className="w-36 px-3 text-right text-base font-medium">Clicks</th>
                          <th className="w-32 px-3 text-right text-base font-medium">UC</th>
                          <th className="w-32 px-3 text-right text-base font-medium">Bots</th>
                          <th className="w-12 px-2"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedFlows.map((flow) => {
                          const destination = flowDestinationDetails(flow.id, streams, destinations, offers, landings);
                          return (
                            <tr key={flow.id} className="align-top">
                              <td className="px-2 py-5 text-neutral-400">
                                <GripVertical className="size-5" />
                              </td>
                              <td className="px-2 py-5">
                                <input className="size-4 rounded border-neutral-300" type="checkbox" aria-label={`Select ${flow.name}`} />
                              </td>
                              <td className="px-3 py-5 text-lg text-neutral-950 dark:text-neutral-50">
                                <div className="flex items-center gap-3">
                                  <span>{flow.id}</span>
                                  <span
                                    className={`size-2.5 rounded-full ${flow.status === "active" ? "bg-[#59bf5f]" : "bg-neutral-300"}`}
                                    title={flow.status}
                                  />
                                </div>
                              </td>
                              <td className="px-3 py-5">
                                <div className="flex items-center gap-3">
                                  <button className="text-lg text-blue-500 hover:underline" onClick={() => openEditFlow(flow)}>
                                    {flow.name}
                                  </button>
                                  <Star className="size-5 text-neutral-400" />
                                </div>
                                <div className="mt-4 pl-10 text-lg font-semibold text-neutral-950 dark:text-neutral-50">
                                  {destination.kindLabel}
                                </div>
                                <div className="mt-2 pl-16 text-base text-neutral-950 dark:text-neutral-50">
                                  {destination.name}
                                  <span className="ml-3 text-[#59bf5f]">{destination.weight}%</span>
                                </div>
                              </td>
                              <td className="px-3 py-5 text-right text-lg text-blue-500">0</td>
                              <td className="px-3 py-5 text-right text-lg text-blue-500">0</td>
                              <td className="px-3 py-5 text-right text-lg text-blue-500">0</td>
                              <td className="px-2 py-5 text-right text-neutral-400">
                                <X className="ml-auto size-5" />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      ) : (
        <div className="space-y-3 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={openCreateEditor}>
              <Plus className="size-4" />
              {t("actions.create")}
            </Button>
            <Button variant="outline">{t("common.groups")}</Button>
            <Input
              className="h-10 w-64"
              placeholder={t("common.search")}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select className="h-10 w-52" value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}>
              <option value="all">{c.allSources}</option>
              {sources.map((source) => (
                <option key={source} value={source}>
                  {source}
                </option>
              ))}
            </Select>
            <Select className="h-10 w-52" value={groupFilter} onChange={(event) => setGroupFilter(event.target.value)}>
              <option value="all">{c.allGroups}</option>
              {groups.map((group) => (
                <option key={group} value={group}>
                  {group}
                </option>
              ))}
            </Select>
            <Select className="h-10 w-52" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">{c.allStates}</option>
              <option value="active">{t("common.active")}</option>
              <option value="paused">{t("common.paused")}</option>
            </Select>
            <Select className="h-10 w-52" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)}>
              <option value="today">{t("common.today")}</option>
              <option value="yesterday">{t("common.yesterday")}</option>
              <option value="last7">{t("common.last7Days")}</option>
            </Select>
            <Button variant="outline" size="icon" onClick={() => void loadData()}>
              <RefreshCw className="size-4" />
            </Button>
            <Button variant="outline" size="icon">
              <Settings className="size-4" />
            </Button>
          </div>

          {error ? <div className="text-sm text-red-500">{error}</div> : null}
          {loading ? <div className="text-sm text-muted-foreground">Loading campaigns...</div> : null}

          <div className="overflow-auto border bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
            <table className="min-w-[1300px] w-full border-collapse text-sm">
              <thead className="bg-neutral-100 text-muted-foreground dark:bg-neutral-900">
                <tr>
                  <TableHead className="w-10"><input type="checkbox" aria-label="Select all campaigns" /></TableHead>
                  <TableHead className="w-16">ID</TableHead>
                  <TableHead>{t("common.name")}</TableHead>
                  <TableHead className="w-28">{c.actions}</TableHead>
                  <TableHead>{c.source}</TableHead>
                  <TableHead>{c.flows}</TableHead>
                  <TableHead>Clicks</TableHead>
                  <TableHead>{c.conversion}</TableHead>
                  <TableHead>CR (sales)</TableHead>
                  <TableHead>{c.revenue}</TableHead>
                  <TableHead>{c.cost}</TableHead>
                  <TableHead>{c.profit}</TableHead>
                  <TableHead>ROI</TableHead>
                  <TableHead>{c.group}</TableHead>
                </tr>
              </thead>
              <tbody>
                {visibleCampaigns.map((campaign) => {
                  const stats = statsForCampaign(campaign.id, campaignStats);
                  const profit = stats.revenue - stats.cost;

                  return (
                    <tr key={campaign.id} className="border-t hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-900/70">
                      <td className="px-3 py-3"><input type="checkbox" aria-label={`Select ${campaign.name}`} /></td>
                      <td className="px-3 py-3">
                        <span className={campaign.status === "active" ? "mr-3 inline-block size-2 rounded-full bg-green-500" : "mr-3 inline-block size-2 rounded-full bg-neutral-300"} />
                        {campaign.id}
                      </td>
                      <td className="max-w-72 truncate px-3 py-3">
                        <button className="truncate text-left text-blue-500 hover:underline" onClick={() => openCampaign(campaign)}>
                          {campaign.name}
                        </button>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2 text-blue-500">
                          <button onClick={() => void copyCampaignLink(campaign)} title="Copy link"><Link2 className="size-4" /></button>
                          <button onClick={() => openCampaign(campaign)} title="Edit campaign"><Pencil className="size-4" /></button>
                          <button title="Stats"><BarChart3 className="size-4" /></button>
                          <button title="Compile" onClick={() => void compileCampaign(campaign)}><FileText className="size-4" /></button>
                          <MoreHorizontal className="size-4" />
                        </div>
                      </td>
                      <td className="px-3 py-3">{campaign.source_name || "-"}</td>
                      <td className="px-3 py-3 text-blue-500">{flowCount(campaign.id, flows)}</td>
                      <td className="px-3 py-3">{formatNumber(stats.clicks)}</td>
                      <td className="px-3 py-3">{formatNumber(stats.conversions)}</td>
                      <td className="px-3 py-3">{formatPercent(stats.conversions, stats.clicks)}</td>
                      <td className="px-3 py-3">{formatMoney(stats.revenue)}</td>
                      <td className="px-3 py-3">{formatMoney(stats.cost, 4)}</td>
                      <td className="px-3 py-3">{formatMoney(profit)}</td>
                      <td className="px-3 py-3">{formatRoi(profit, stats.cost)}</td>
                      <td className="px-3 py-3">{campaign.group_name || "No group"}</td>
                    </tr>
                  );
                })}
                {visibleCampaigns.length === 0 ? (
                  <tr>
                    <td className="px-3 py-8 text-center text-muted-foreground" colSpan={14}>
                      {c.noCampaigns}
                    </td>
                  </tr>
                ) : null}
              </tbody>
              <tfoot className="border-t bg-neutral-50 text-muted-foreground dark:border-neutral-800 dark:bg-neutral-900">
                <tr>
                  <td className="px-3 py-3" colSpan={5} />
                  <td className="px-3 py-3">{totals.flows}</td>
                  <td className="px-3 py-3">{formatNumber(totals.clicks)}</td>
                  <td className="px-3 py-3">{formatNumber(totals.conversions)}</td>
                  <td className="px-3 py-3">{formatPercent(totals.conversions, totals.clicks)}</td>
                  <td className="px-3 py-3">{formatMoney(totals.revenue)}</td>
                  <td className="px-3 py-3">{formatMoney(totals.cost, 4)}</td>
                  <td className="px-3 py-3">{formatMoney(totals.revenue - totals.cost)}</td>
                  <td className="px-3 py-3">{formatRoi(totals.revenue - totals.cost, totals.cost)}</td>
                  <td />
                </tr>
              </tfoot>
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
            <span className="text-sm text-muted-foreground">1 - {visibleCampaigns.length} of {campaigns.length}</span>
            <Button className="ml-auto" variant="outline">
              {t("actions.export")}
              <ChevronDown className="size-4" />
            </Button>
          </div>
        </div>
      )}

      {flowModalOpen ? (
        <div className="fixed inset-0 z-50 bg-black/45 p-8">
          <div className="mx-auto flex max-h-[92vh] max-w-5xl flex-col rounded-lg bg-white shadow-xl dark:bg-neutral-950">
            <div className="flex items-center border-b px-6 py-5 dark:border-neutral-800">
              <h2 className="text-2xl font-semibold">{editingFlow ? c.editFlow : c.createFlow}</h2>
              <button className="ml-auto text-muted-foreground" onClick={() => { setFlowModalOpen(false); setEditingFlow(null); }}>
                <X className="size-6" />
              </button>
            </div>
            <div className="px-6">
              <Tabs
                items={[
                  ["main", "Main"],
                  ["schema", c.schema],
                  ["filters", "Filters"],
                  ["monitoring", c.monitoring],
                  ["notes", c.notes],
                ]}
                value={flowTab}
                onChange={(value) => setFlowTab(value as FlowTab)}
              />
            </div>
            <div className="flex-1 overflow-auto px-6 py-5">
              {flowTab === "main" ? <FlowMainTab c={c} form={flowForm} setForm={setFlowForm} /> : null}
              {flowTab === "schema" ? (
                <FlowSchemaTab c={c} form={flowForm} offers={offers} landings={landings} setForm={setFlowForm} />
              ) : null}
              {flowTab === "filters" ? (
                <div className="text-sm text-muted-foreground">Filters подключим следующим шагом.</div>
              ) : null}
              {flowTab === "monitoring" ? (
                <div className="text-sm text-muted-foreground">Monitoring soon.</div>
              ) : null}
              {flowTab === "notes" ? (
                <textarea
                  className="min-h-56 w-full rounded-md border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                  value={flowForm.notes}
                  onChange={(event) => setFlowForm((form) => ({ ...form, notes: event.target.value }))}
                />
              ) : null}
            </div>
            <div className="flex justify-end gap-2 border-t px-6 py-4 dark:border-neutral-800">
              <Button variant="outline" onClick={() => { setFlowModalOpen(false); setEditingFlow(null); }}>
                {t("actions.cancel")}
              </Button>
              <Button disabled={saving} onClick={() => void saveFlow()}>
                {editingFlow ? t("actions.save") : t("actions.create")}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function GeneralTab({
  c,
  domains,
  trafficSources,
  form,
  setForm,
}: {
  c: (typeof copy)["en"];
  domains: Domain[];
  trafficSources: TrafficSource[];
  form: CampaignForm;
  setForm: Dispatch<SetStateAction<CampaignForm>>;
}) {
  function applyTrafficSource(sourceId: string) {
    const source = trafficSources.find((item) => String(item.id) === sourceId);
    setForm((current) => ({
      ...current,
      sourceId,
      sourceName: source?.name ?? "",
      parameters: source ? { ...current.parameters, ...mapTrafficSourceParameters(source.parameters) } : current.parameters,
    }));
  }

  return (
    <div className="space-y-5">
      <Field label={c.domain}>
        <Select value={form.domainId} onChange={(event) => setForm((current) => ({ ...current, domainId: event.target.value }))}>
          <option value="">No domain</option>
          {domains.map((domain) => (
            <option key={domain.id} value={domain.id} disabled={domain.status !== "ok"}>
              {domain.domain} {domain.status !== "ok" ? `(${domain.status})` : ""}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Alias">
        <div className="flex gap-2">
          <Input value={form.alias} onChange={(event) => setForm((current) => ({ ...current, alias: event.target.value }))} />
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => setForm((current) => ({ ...current, alias: generateAlias() }))}
            title="Generate alias"
          >
            <RefreshCw className="size-4" />
          </Button>
        </div>
      </Field>
      <Field label={c.group}>
        <Input
          placeholder="Type to search or create"
          value={form.groupName}
          onChange={(event) => setForm((current) => ({ ...current, groupName: event.target.value }))}
        />
      </Field>
      <Field label={c.source}>
        <Select value={form.sourceId} onChange={(event) => applyTrafficSource(event.target.value)}>
          <option value="">No traffic source</option>
          {trafficSources.map((source) => (
            <option key={source.id} value={source.id}>
              {source.name}
            </option>
          ))}
        </Select>
      </Field>
      {!form.sourceId ? (
        <Field label="Source name">
          <Input
            placeholder="Type to search or create"
            value={form.sourceName}
            onChange={(event) => setForm((current) => ({ ...current, sourceName: event.target.value }))}
          />
        </Field>
      ) : null}
      <RadioGroup
        label={c.flowRotation}
        name="flow-rotation"
        value={form.flowRotation}
        options={[
          ["position", "Position-based"],
          ["weight", "Weight-based"],
        ]}
        onChange={(value) => setForm((current) => ({ ...current, flowRotation: value as "position" | "weight" }))}
      />
      <Field label={c.costModel}>
        <Select value={form.costModel} onChange={(event) => setForm((current) => ({ ...current, costModel: event.target.value as "cpc" | "cpm" }))}>
          <option value="cpc">CPC (Cost per click)</option>
          <option value="cpm">CPM (Cost per mille)</option>
        </Select>
      </Field>
      <Field label={c.costValue}>
        <div className="flex gap-2">
          <Input
            className="max-w-44"
            type="number"
            value={form.costValue}
            onChange={(event) => setForm((current) => ({ ...current, costValue: event.target.value }))}
          />
          <Select
            className="max-w-36"
            value={form.costCurrency}
            onChange={(event) => setForm((current) => ({ ...current, costCurrency: event.target.value }))}
          >
            <option value="EUR">EUR</option>
            <option value="USD">USD</option>
          </Select>
        </div>
        <Checkbox
          checked={form.costFromParam}
          label={c.fromCost}
          onChange={(checked) => setForm((current) => ({ ...current, costFromParam: checked }))}
        />
      </Field>
      <Field label={c.trafficLoss}>
        <div className="flex max-w-52">
          <Input
            type="number"
            value={form.trafficLoss}
            onChange={(event) => setForm((current) => ({ ...current, trafficLoss: event.target.value }))}
          />
          <span className="flex w-16 items-center justify-center rounded-r-md border border-l-0 bg-muted">%</span>
        </div>
      </Field>
      <RadioGroup
        label={c.uniqueness}
        name="uniqueness"
        value={form.uniqueness}
        options={[
          ["ip_ua", "IP with user-agent"],
          ["ip", "IP only"],
          ["parameter", "Parameter"],
        ]}
        onChange={(value) => setForm((current) => ({ ...current, uniqueness: value as CampaignForm["uniqueness"] }))}
      />
      <Checkbox
        checked={form.useCookies}
        label="Use cookies"
        onChange={(checked) => setForm((current) => ({ ...current, useCookies: checked }))}
      />
      <Field label={c.uniquenessTtl}>
        <div className="flex max-w-52">
          <Input
            type="number"
            value={form.uniquenessTtlHours}
            onChange={(event) => setForm((current) => ({ ...current, uniquenessTtlHours: event.target.value }))}
          />
          <span className="flex w-24 items-center justify-center rounded-r-md border border-l-0 bg-muted">hours</span>
        </div>
      </Field>
      <Field label={c.apiToken}>
        <Input readOnly value="generated after save" />
      </Field>
      <RadioGroup
        label="Status"
        name="campaign-status"
        value={form.status}
        options={[
          ["active", "Active"],
          ["paused", "Disabled"],
        ]}
        onChange={(value) => setForm((current) => ({ ...current, status: value as "active" | "paused" }))}
      />
    </div>
  );
}

function ParametersTab({
  form,
  setForm,
}: {
  form: CampaignForm;
  setForm: Dispatch<SetStateAction<CampaignForm>>;
}) {
  return (
    <div className="grid max-w-3xl grid-cols-[160px_180px_24px_1fr] gap-3 text-sm">
      <div className="font-medium text-muted-foreground">Name</div>
      <div className="font-medium text-muted-foreground">Parameter</div>
      <div />
      <div className="font-medium text-muted-foreground">Placeholder or value</div>
      {parameterRows.map(([label, parameter]) => (
        <div key={parameter} className="contents">
          <Input readOnly value={label} className="bg-muted text-muted-foreground" />
          <Input readOnly value={parameter} className="text-right" />
          <div className="flex items-center justify-center">=</div>
          <Input
            value={form.parameters[parameter] ?? ""}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                parameters: { ...current.parameters, [parameter]: event.target.value },
              }))
            }
          />
        </div>
      ))}
    </div>
  );
}

function FlowMainTab({
  c,
  form,
  setForm,
}: {
  c: (typeof copy)["en"];
  form: FlowForm;
  setForm: Dispatch<SetStateAction<FlowForm>>;
}) {
  return (
    <div className="space-y-5">
      <Field label={c.flowName}>
        <Input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
      </Field>
      <RadioGroup
        label={c.flowType}
        name="flow-type"
        value={form.flowType}
        options={[
          ["regular", "Regular"],
          ["default", "Default"],
          ["forced", "Forced"],
        ]}
        onChange={(value) => setForm((current) => ({ ...current, flowType: value as FlowType }))}
      />
      <Field label="Position">
        <Input
          className="max-w-52"
          type="number"
          value={form.position}
          onChange={(event) => setForm((current) => ({ ...current, position: event.target.value }))}
        />
      </Field>
      <RadioGroup
        label={c.collectClicks}
        name="collect-clicks"
        value={form.collectClicks ? "yes" : "no"}
        options={[
          ["yes", "Yes"],
          ["no", "No"],
        ]}
        onChange={(value) => setForm((current) => ({ ...current, collectClicks: value === "yes" }))}
      />
      <RadioGroup
        label="Status"
        name="flow-status"
        value={form.status}
        options={[
          ["active", "Active"],
          ["paused", "Disabled"],
        ]}
        onChange={(value) => setForm((current) => ({ ...current, status: value as "active" | "paused" }))}
      />
    </div>
  );
}

function FlowSchemaTab({
  c,
  form,
  offers,
  landings,
  setForm,
}: {
  c: (typeof copy)["en"];
  form: FlowForm;
  offers: Offer[];
  landings: Landing[];
  setForm: Dispatch<SetStateAction<FlowForm>>;
}) {
  return (
    <div className="space-y-5">
      <RadioGroup
        label={c.destination}
        name="destination-type"
        value={form.destinationType}
        options={[
          ["offer", "Offer"],
          ["landing", "Landing"],
          ["url", "URL"],
        ]}
        onChange={(value) => setForm((current) => ({ ...current, destinationType: value as DestinationType, destinationId: "", url: "" }))}
      />
      {form.destinationType === "offer" ? (
        <Field label="Offer">
          <Select value={form.destinationId} onChange={(event) => setForm((current) => ({ ...current, destinationId: event.target.value }))}>
            <option value="">Select offer</option>
            {offers.map((offer) => (
              <option key={offer.id} value={offer.id}>
                {offer.name}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}
      {form.destinationType === "landing" ? (
        <Field label="Landing">
          <Select value={form.destinationId} onChange={(event) => setForm((current) => ({ ...current, destinationId: event.target.value }))}>
            <option value="">Select landing</option>
            {landings.map((landing) => (
              <option key={landing.id} value={landing.id}>
                {landing.name}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}
      {form.destinationType === "url" ? (
        <Field label="URL">
          <Input value={form.url} onChange={(event) => setForm((current) => ({ ...current, url: event.target.value }))} />
        </Field>
      ) : null}
      <Field label="Weight">
        <Input
          className="max-w-52"
          type="number"
          value={form.weight}
          onChange={(event) => setForm((current) => ({ ...current, weight: event.target.value }))}
        />
      </Field>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function Checkbox({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="mt-3 flex items-center gap-2 text-sm">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
}

function RadioGroup({
  label,
  name,
  value,
  options,
  onChange,
}: {
  label: string;
  name: string;
  value: string;
  options: Array<[string, string]>;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-3">
      <Label>{label}</Label>
      <div className="flex flex-wrap gap-6">
        {options.map(([optionValue, optionLabel]) => (
          <label key={optionValue} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name={name}
              checked={value === optionValue}
              onChange={() => onChange(optionValue)}
            />
            {optionLabel}
          </label>
        ))}
      </div>
    </div>
  );
}

function Tabs({
  items,
  value,
  onChange,
}: {
  items: Array<[string, string]>;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex gap-6 border-b px-5 dark:border-neutral-800">
      {items.map(([tab, label]) => (
        <button
          key={tab}
          className={`border-b-2 py-4 text-sm font-medium ${
            value === tab
              ? "border-foreground text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => onChange(tab)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function TableHead({ children, className = "" }: { children?: ReactNode; className?: string }) {
  return <th className={`border-r px-3 py-3 text-left font-medium dark:border-neutral-800 ${className}`}>{children}</th>;
}

function campaignToForm(campaign: Campaign): CampaignForm {
  return {
    name: campaign.name,
    domainId: campaign.domain_id ? String(campaign.domain_id) : "",
    alias: campaign.alias,
    groupName: campaign.group_name ?? "",
    sourceId: campaign.traffic_source_id ? String(campaign.traffic_source_id) : "",
    sourceName: campaign.source_name ?? "",
    flowRotation: campaign.flow_rotation,
    costModel: campaign.cost_model,
    costValue: String(campaign.cost_value ?? 0),
    costCurrency: campaign.cost_currency?.trim() || "EUR",
    costFromParam: campaign.cost_from_param,
    trafficLoss: String(campaign.traffic_loss ?? 0),
    uniqueness: campaign.uniqueness,
    useCookies: campaign.use_cookies,
    uniquenessTtlHours: String(campaign.uniqueness_ttl_hours ?? 24),
    parameters: campaign.parameters ?? {},
    s2sPostbacks: campaign.s2s_postbacks ?? {},
    notes: campaign.notes ?? "",
    status: campaign.status === "paused" ? "paused" : "active",
  };
}

function formToPayload(form: CampaignForm) {
  return {
    name: form.name,
    domain_id: form.domainId ? Number(form.domainId) : undefined,
    clear_domain_id: !form.domainId,
    traffic_source_id: form.sourceId ? Number(form.sourceId) : undefined,
    clear_traffic_source: !form.sourceId,
    alias: form.alias || generateAlias(),
    group_name: form.groupName,
    source_name: form.sourceName,
    flow_rotation: form.flowRotation,
    cost_model: form.costModel,
    cost_value: Number(form.costValue) || 0,
    cost_currency: form.costCurrency,
    cost_from_param: form.costFromParam,
    traffic_loss: Number(form.trafficLoss) || 0,
    uniqueness: form.uniqueness,
    use_cookies: form.useCookies,
    uniqueness_ttl_hours: Number(form.uniquenessTtlHours) || 24,
    parameters: cleanupMap(form.parameters),
    s2s_postbacks: cleanupMap(form.s2sPostbacks),
    notes: form.notes,
    status: form.status,
  };
}

function generateAlias() {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const cryptoObject = typeof window !== "undefined" ? window.crypto : undefined;
  const bytes = new Uint8Array(6);
  if (cryptoObject?.getRandomValues) {
    cryptoObject.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

function cleanupMap(values: Record<string, string>) {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value.trim() !== ""));
}

function mapTrafficSourceParameters(values: Record<string, string>) {
  const aliases: Record<string, string> = {
    fbclid: "external_id",
    utm_campaign: "ad_campaign_id",
    utm_source: "source",
  };

  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [aliases[key] ?? key, value]),
  );
}

function campaignTrackerURL(campaign: Campaign) {
  const base = campaign.domain_name ? `https://${campaign.domain_name}` : TRACKER_URL;
  const alias = campaign.alias || campaign.slug;
  const params = cleanupMap(campaign.parameters ?? {});
  const query = Object.entries(params)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeMacroValue(value)}`)
    .join("&");

  return `${base}/${alias}${query ? `?${query}` : ""}`;
}

function encodeMacroValue(value: string) {
  return encodeURIComponent(value.trim())
    .replace(/%7B/g, "{")
    .replace(/%7D/g, "}")
    .replace(/%5B/g, "[")
    .replace(/%5D/g, "]");
}

function flowCount(campaignId: number, flows: Flow[]) {
  return flows.filter((flow) => flow.campaign_id === campaignId).length;
}

function flowToForm(flow: Flow, streams: Stream[], destinations: StreamDestination[]): FlowForm {
  const stream = streams.find((item) => item.flow_id === flow.id);
  const destination = stream ? destinations.find((item) => item.stream_id === stream.id) : undefined;

  return {
    name: flow.name,
    flowType: flow.flow_type,
    position: String(flow.position || 1),
    collectClicks: flow.collect_clicks,
    status: flow.status,
    destinationType: destination?.destination_type ?? "offer",
    destinationId: destination?.destination_id ? String(destination.destination_id) : "",
    url: destination?.url ?? "",
    weight: String(destination?.weight ?? 100),
    notes: flow.notes ?? "",
  };
}

function flowPayload(form: FlowForm, fallbackPosition: number) {
  return {
    name: form.name,
    flow_type: form.flowType,
    position: Number(form.position) || fallbackPosition,
    collect_clicks: form.collectClicks,
    status: form.status,
    notes: form.notes,
  };
}

function destinationPayload(form: FlowForm) {
  return form.destinationType === "url"
    ? {
        destination_type: "url",
        destination_id: null,
        url: form.url,
        weight: Number(form.weight) || 100,
        status: "active",
      }
    : {
        destination_type: form.destinationType,
        destination_id: Number(form.destinationId),
        url: null,
        weight: Number(form.weight) || 100,
        status: "active",
      };
}

async function saveFlowDestination(
  flow: Flow,
  form: FlowForm,
  streams: Stream[],
  destinations: StreamDestination[],
): Promise<{ stream?: Stream; destination?: StreamDestination }> {
  let stream = streams.find((item) => item.flow_id === flow.id);
  if (!stream) {
    stream = await apiRequest<Stream>("/streams", {
      method: "POST",
      body: JSON.stringify({
        flow_id: flow.id,
        name: `${flow.name} stream`,
        position: 1,
        status: "active",
      }),
    });
  }

  const destination = destinations.find((item) => item.stream_id === stream.id);
  const payload = destinationPayload(form);
  if (destination) {
    const updatedDestination = await apiRequest<StreamDestination>(`/stream-destinations/${destination.id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    return { stream, destination: updatedDestination };
  }

  const createdDestination = await apiRequest<StreamDestination>("/stream-destinations", {
    method: "POST",
    body: JSON.stringify({ stream_id: stream.id, ...payload }),
  });
  return { stream, destination: createdDestination };
}

function statsForCampaign(campaignId: number, stats: Record<number, CampaignStats>): CampaignStats {
  return stats[campaignId] ?? {
    campaign_id: campaignId,
    clicks: 0,
    unique_campaign: 0,
    conversions: 0,
    cost: 0,
    revenue: 0,
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

function formatPercent(numerator: number, denominator: number) {
  if (!denominator) {
    return "0.00%";
  }
  return `${formatNumber((numerator / denominator) * 100, 2)}%`;
}

function formatRoi(profit: number, cost: number) {
  if (!cost) {
    return "0.00%";
  }
  return `${formatNumber((profit / cost) * 100, 2)}%`;
}

function CampaignToastView({ toast }: { toast: CampaignToast }) {
  const tone =
    toast.kind === "error"
      ? "border-red-200 bg-red-50 text-red-800 dark:border-red-900/70 dark:bg-red-950 dark:text-red-100"
      : toast.kind === "success"
        ? "border-green-200 bg-green-50 text-green-800 dark:border-green-900/70 dark:bg-green-950 dark:text-green-100"
        : "border-neutral-200 bg-white text-neutral-900 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-50";

  return (
    <div
      className={`fixed right-5 top-20 z-50 w-[min(420px,calc(100vw-40px))] rounded-md border px-4 py-3 shadow-lg ${tone}`}
      role={toast.kind === "error" ? "alert" : "status"}
    >
      <div className="text-sm font-semibold">{toast.title}</div>
      {toast.description ? (
        <div className="mt-1 break-all text-xs leading-5 opacity-80">{toast.description}</div>
      ) : null}
    </div>
  );
}

function flowDestinationDetails(
  flowId: number,
  streams: Stream[],
  destinations: StreamDestination[],
  offers: Offer[],
  landings: Landing[],
) {
  const streamIds = streams.filter((stream) => stream.flow_id === flowId).map((stream) => stream.id);
  const destination = destinations.find((item) => streamIds.includes(item.stream_id));
  if (!destination) {
    return { kindLabel: "Destination", name: "-", weight: 100 };
  }
  if (destination.destination_type === "url") {
    return { kindLabel: "URL", name: destination.url ?? "URL", weight: destination.weight };
  }
  if (destination.destination_type === "offer") {
    const name = offers.find((offer) => offer.id === destination.destination_id)?.name ?? `Offer #${destination.destination_id}`;
    return { kindLabel: "Offers", name: `[${destination.destination_id ?? "-"}] ${name}`, weight: destination.weight };
  }
  const name = landings.find((landing) => landing.id === destination.destination_id)?.name ?? `Landing #${destination.destination_id}`;
  return { kindLabel: "Landings", name: `[${destination.destination_id ?? "-"}] ${name}`, weight: destination.weight };
}

function uniqueSorted(values: Array<string | undefined>) {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))).sort((a, b) =>
    a.localeCompare(b),
  );
}
