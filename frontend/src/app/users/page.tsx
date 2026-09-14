"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { getAuthToken } from "@/lib/auth-token";
import { useI18n } from "@/lib/i18n";
import type { TranslationKey } from "@/lib/i18n";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080/api";

type Role = "admin" | "buyer" | "teamlead" | "finance";
type Tab = "users" | "teams";

type User = {
  id: number;
  team_id: number;
  name: string;
  email: string;
  role: Role;
  avatar_url?: string;
  two_factor_enabled?: boolean;
  manager_id?: number;
};

type CurrentUser = {
  id: number;
  name: string;
  email: string;
  role: Role;
  avatar_url?: string;
  manager_id?: number;
};

type BuyerGroup = {
  id: number;
  team_id: number;
  name: string;
  lead_id?: number;
  lead?: User;
  buyers: User[];
};

type UserForm = {
  name: string;
  email: string;
  password: string;
  repeatPassword: string;
  role: Role;
};

const roleLabelKeys: Record<Role, TranslationKey> = {
  admin: "common.role.admin",
  buyer: "common.role.buyer",
  teamlead: "common.role.teamlead",
  finance: "common.role.finance",
};

const emptyForm: UserForm = {
  name: "",
  email: "",
  password: "",
  repeatPassword: "",
  role: "buyer",
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

export default function UsersPage() {
  return (
    <AppShell title="Users">
      {({ user }) => <UsersManagement currentUser={user as CurrentUser} />}
    </AppShell>
  );
}

function UsersManagement({ currentUser }: { currentUser: CurrentUser }) {
  const { t } = useI18n();
  const [users, setUsers] = useState<User[]>([]);
  const [groups, setGroups] = useState<BuyerGroup[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>("users");
  const [form, setForm] = useState<UserForm>(emptyForm);
  const [teamName, setTeamName] = useState("");
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [teamModalOpen, setTeamModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const canManage = currentUser.role === "admin" || currentUser.role === "teamlead";
  const canCreateTeam = currentUser.role === "admin";

  const sortedUsers = useMemo(
    () => [...users].sort((a, b) => a.name.localeCompare(b.name)),
    [users],
  );

  const teamleads = useMemo(
    () => sortedUsers.filter((user) => user.role === "teamlead"),
    [sortedUsers],
  );

  const buyers = useMemo(
    () => sortedUsers.filter((user) => user.role === "buyer"),
    [sortedUsers],
  );

  const loadData = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const [userData, groupData] = await Promise.all([
        apiRequest<User[]>("/team/users"),
        apiRequest<BuyerGroup[]>("/groups").catch(() => [] as BuyerGroup[]),
      ]);
      setUsers(userData);
      setGroups(groupData);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not load users");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadData();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadData]);

  function openCreateModal() {
    setEditingUser(null);
    setForm(emptyForm);
    setError("");
    setModalOpen(true);
  }

  function openCreateTeamModal() {
    setTeamName("");
    setError("");
    setTeamModalOpen(true);
  }

  function closeTeamModal() {
    setTeamModalOpen(false);
    setTeamName("");
  }

  function openEditModal(user: User) {
    setEditingUser(user);
    setForm({
      name: user.name,
      email: user.email,
      password: "",
      repeatPassword: "",
      role: user.role,
    });
    setError("");
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingUser(null);
    setForm(emptyForm);
  }

  function replaceGroup(updated: BuyerGroup) {
    setGroups((items) => {
      const exists = items.some((item) => item.id === updated.id);
      if (!exists) {
        return [...items, updated];
      }
      return items.map((item) => (item.id === updated.id ? updated : item));
    });
  }

  async function saveUser() {
    setError("");

    if (!form.name.trim() || !form.email.trim()) {
      setError("Username and email are required");
      return;
    }

    if (!editingUser && !form.password) {
      setError("Password is required");
      return;
    }

    if (form.password !== form.repeatPassword) {
      setError("Passwords do not match");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        email: form.email.trim(),
        role: form.role,
        ...(form.password ? { password: form.password } : {}),
        ...(editingUser && form.role !== "buyer" ? { clear_manager_id: true } : {}),
      };

      if (editingUser) {
        const updatedUser = await apiRequest<User>(`/team/users/${editingUser.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        setUsers((items) => items.map((item) => (item.id === updatedUser.id ? updatedUser : item)));
      } else {
        const createdUser = await apiRequest<User>("/team/users", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setUsers((items) => [...items, createdUser]);
      }

      closeModal();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not save user");
    } finally {
      setSaving(false);
    }
  }

  async function saveTeam() {
    setError("");
    if (!teamName.trim()) {
      setError("Team name is required");
      return;
    }

    setSaving(true);
    try {
      const created = await apiRequest<BuyerGroup>("/groups", {
        method: "POST",
        body: JSON.stringify({ name: teamName.trim() }),
      });
      setGroups((items) => [...items, created]);
      closeTeamModal();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not create team");
    } finally {
      setSaving(false);
    }
  }

  async function setTeamLead(group: BuyerGroup, leadID: string) {
    setError("");
    try {
      const payload = leadID ? { lead_id: Number(leadID) } : { clear_lead_id: true };
      const updated = await apiRequest<BuyerGroup>(`/groups/${group.id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      replaceGroup(updated);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not set teamlead");
    }
  }

  async function addBuyerToGroup(group: BuyerGroup, buyerID: string) {
    if (!buyerID) {
      return;
    }

    setError("");
    try {
      const updated = await apiRequest<BuyerGroup>(`/groups/${group.id}/buyers`, {
        method: "POST",
        body: JSON.stringify({ user_id: Number(buyerID) }),
      });
      replaceGroup(updated);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not add buyer");
    }
  }

  async function removeBuyerFromGroup(group: BuyerGroup, buyer: User) {
    setError("");
    try {
      const updated = await apiRequest<BuyerGroup>(`/groups/${group.id}/buyers/${buyer.id}`, {
        method: "DELETE",
      });
      replaceGroup(updated);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not remove buyer");
    }
  }

  async function deleteGroup(group: BuyerGroup) {
    const confirmed = window.confirm(`Delete team ${group.name}?`);
    if (!confirmed) {
      return;
    }

    setError("");
    try {
      await apiRequest<void>(`/groups/${group.id}`, { method: "DELETE" });
      setGroups((items) => items.filter((item) => item.id !== group.id));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not delete team");
    }
  }

  async function deleteUser(user: User) {
    if (user.id === currentUser.id) {
      setError("You cannot delete your own account");
      return;
    }

    const confirmed = window.confirm(`Delete ${user.name}?`);
    if (!confirmed) {
      return;
    }

    setError("");
    try {
      await apiRequest<void>(`/team/users/${user.id}`, { method: "DELETE" });
      setUsers((items) => items.filter((item) => item.id !== user.id));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not delete user");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">{t("menu.users")}</h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            Manage accounts, teams, and buyer ownership.
          </p>
        </div>
        {((activeTab === "users" && canManage) || (activeTab === "teams" && canCreateTeam)) && (
          <Button
            className="h-9 rounded-md bg-[#45b84a] px-3 text-white hover:bg-[#3da442]"
            onClick={activeTab === "teams" ? openCreateTeamModal : openCreateModal}
          >
            <Plus className="h-4 w-4" />
            {activeTab === "teams" ? "Create team" : t("actions.create")}
          </Button>
        )}
      </div>

      <div className="inline-flex rounded-md border border-neutral-200 bg-white p-1 dark:border-neutral-800 dark:bg-neutral-900">
        {(["users", "teams"] as const).map((tab) => (
          <button
            key={tab}
            className={[
              "h-8 rounded px-4 text-sm font-medium capitalize transition-colors",
              activeTab === tab
                ? "bg-neutral-950 text-white dark:bg-neutral-100 dark:text-neutral-950"
                : "text-neutral-500 hover:text-neutral-950 dark:text-neutral-400 dark:hover:text-neutral-50",
            ].join(" ")}
            onClick={() => setActiveTab(tab)}
            type="button"
          >
            {tab === "users" ? t("menu.users") : t("common.groups")}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {activeTab === "users" ? (
        <UsersTable
          canManage={canManage}
          currentUser={currentUser}
          loading={loading}
          onDelete={(user) => void deleteUser(user)}
          onEdit={openEditModal}
          users={sortedUsers}
        />
      ) : (
        <TeamsTab
          buyers={buyers}
          canCreate={canCreateTeam}
          currentUser={currentUser}
          groups={groups}
          loading={loading}
          teamleads={teamleads}
          onAddBuyer={(group, buyerID) => void addBuyerToGroup(group, buyerID)}
          onCreateTeam={openCreateTeamModal}
          onDeleteTeam={(group) => void deleteGroup(group)}
          onRemoveBuyer={(group, buyer) => void removeBuyerFromGroup(group, buyer)}
          onSetLead={(group, leadID) => void setTeamLead(group, leadID)}
        />
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <div className="max-h-[calc(100vh-32px)] w-full max-w-3xl overflow-auto rounded-lg bg-white shadow-xl dark:bg-neutral-950">
            <div className="flex items-center justify-between border-b border-neutral-200 px-6 py-4 dark:border-neutral-800">
              <div className="flex items-center gap-5">
                <span className="border-b-2 border-neutral-950 pb-2 text-lg font-semibold dark:border-neutral-50">
                  {t("profile.account")}
                </span>
                <span className="pb-2 text-lg font-semibold text-neutral-400">Access</span>
              </div>
              <Button aria-label={t("actions.close")} variant="ghost" size="icon-sm" onClick={closeModal}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="space-y-5 px-6 py-5">
              <div className="grid gap-5 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="user-name">{t("common.name")}</Label>
                  <Input
                    id="user-name"
                    placeholder="Username"
                    value={form.name}
                    onChange={(event) => setForm({ ...form, name: event.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="user-email">Email</Label>
                  <Input
                    id="user-email"
                    placeholder="name@company.com"
                    type="email"
                    value={form.email}
                    onChange={(event) => setForm({ ...form, email: event.target.value })}
                  />
                </div>
              </div>

              <div className="grid gap-5 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="user-password">
                    {editingUser ? "New password" : t("login.password")}
                  </Label>
                  <Input
                    id="user-password"
                    placeholder={editingUser ? "Leave empty to keep current" : "Password"}
                    type="password"
                    value={form.password}
                    onChange={(event) => setForm({ ...form, password: event.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="user-repeat-password">Repeat password</Label>
                  <Input
                    id="user-repeat-password"
                    placeholder="Repeat password"
                    type="password"
                    value={form.repeatPassword}
                    onChange={(event) =>
                      setForm({ ...form, repeatPassword: event.target.value })
                    }
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="user-role">Role</Label>
                <Select
                  id="user-role"
                  value={form.role}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      role: event.target.value as Role,
                    })
                  }
                >
                  <option value="buyer">{t("common.role.buyer")}</option>
                  <option value="teamlead">{t("common.role.teamlead")}</option>
                  <option value="finance">{t("common.role.finance")}</option>
                  <option value="admin">{t("common.role.admin")}</option>
                </Select>
              </div>

              {error && (
                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-neutral-200 px-6 py-4 dark:border-neutral-800">
              <Button variant="outline" onClick={closeModal}>
                {t("actions.cancel")}
              </Button>
              <Button
                className="bg-[#45b84a] text-white hover:bg-[#3da442]"
                disabled={saving}
                onClick={() => void saveUser()}
              >
                {editingUser ? (
                  <>
                    <Pencil className="h-4 w-4" />
                    {t("actions.save")}
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4" />
                    {t("actions.create")}
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {teamModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-md overflow-hidden rounded-lg bg-white shadow-xl dark:bg-neutral-950">
            <div className="flex items-center justify-between border-b border-neutral-200 px-6 py-4 dark:border-neutral-800">
              <h2 className="text-lg font-semibold">Create team</h2>
              <Button aria-label={t("actions.close")} variant="ghost" size="icon-sm" onClick={closeTeamModal}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="space-y-5 px-6 py-5">
              <div className="space-y-2">
                <Label htmlFor="team-name">Team name</Label>
                <Input
                  id="team-name"
                  placeholder="Team name"
                  value={teamName}
                  onChange={(event) => setTeamName(event.target.value)}
                />
              </div>

              {error && (
                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-neutral-200 px-6 py-4 dark:border-neutral-800">
              <Button variant="outline" onClick={closeTeamModal}>
                {t("actions.cancel")}
              </Button>
              <Button
                className="bg-[#45b84a] text-white hover:bg-[#3da442]"
                disabled={saving}
                onClick={() => void saveTeam()}
              >
                <Plus className="h-4 w-4" />
                Create team
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function UsersTable({
  canManage,
  currentUser,
  loading,
  onDelete,
  onEdit,
  users,
}: {
  canManage: boolean;
  currentUser: CurrentUser;
  loading: boolean;
  onDelete: (user: User) => void;
  onEdit: (user: User) => void;
  users: User[];
}) {
  const { t } = useI18n();

  return (
    <div className="overflow-hidden border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <table className="w-full border-collapse text-left text-sm">
        <thead className="bg-neutral-50 text-neutral-500 dark:bg-neutral-950 dark:text-neutral-400">
          <tr>
            <th className="h-10 border-b border-neutral-200 px-3 font-medium dark:border-neutral-800">
              {t("common.name")}
            </th>
            <th className="h-10 border-b border-neutral-200 px-3 font-medium dark:border-neutral-800">
              Email
            </th>
            <th className="h-10 border-b border-neutral-200 px-3 font-medium dark:border-neutral-800">
              Role
            </th>
            <th className="h-10 border-b border-neutral-200 px-3 font-medium dark:border-neutral-800">
              2FA
            </th>
            <th className="h-10 w-20 border-b border-neutral-200 px-3 text-right font-medium dark:border-neutral-800" />
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={5} className="h-20 px-3 text-neutral-500">
                Loading users...
              </td>
            </tr>
          ) : users.length === 0 ? (
            <tr>
              <td colSpan={5} className="h-20 px-3 text-neutral-500">
                No users yet.
              </td>
            </tr>
          ) : (
            users.map((user) => (
              <tr
                key={user.id}
                className="border-b border-neutral-200 last:border-0 dark:border-neutral-800"
              >
                <td className="h-11 px-3">
                  <div className="flex items-center gap-3">
                    <UserAvatar avatarUrl={user.avatar_url} name={user.name} />
                    <button
                      className="min-w-0 truncate font-medium text-blue-600 hover:text-blue-700 hover:underline disabled:pointer-events-none disabled:text-neutral-950 dark:disabled:text-neutral-50"
                      disabled={!canManage}
                      onClick={() => onEdit(user)}
                      type="button"
                    >
                      {user.name}
                    </button>
                  </div>
                </td>
                <td className="h-11 px-3 text-neutral-600 dark:text-neutral-400">{user.email}</td>
                <td className="h-11 px-3">
                  <Badge className="border-neutral-200 bg-neutral-50 text-neutral-700 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-200">
                    {t(roleLabelKeys[user.role])}
                  </Badge>
                </td>
                <td className="h-11 px-3">
                  <Badge
                    className={
                      user.two_factor_enabled
                        ? "border-green-200 bg-green-50 text-green-700 dark:border-green-900/60 dark:bg-green-950/40 dark:text-green-300"
                        : "border-neutral-200 bg-neutral-50 text-neutral-500 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-400"
                    }
                  >
                    {user.two_factor_enabled ? t("common.enabled") : t("common.disabled")}
                  </Badge>
                </td>
                <td className="h-11 px-3 text-right">
                  {canManage && user.id !== currentUser.id && (
                    <Button
                      aria-label={`Delete ${user.name}`}
                      size="icon-sm"
                      variant="ghost"
                      className="text-red-500 hover:bg-red-50 hover:text-red-600"
                      onClick={() => onDelete(user)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function TeamsTab({
  buyers,
  canCreate,
  currentUser,
  groups,
  loading,
  onAddBuyer,
  onCreateTeam,
  onDeleteTeam,
  onRemoveBuyer,
  onSetLead,
  teamleads,
}: {
  buyers: User[];
  canCreate: boolean;
  currentUser: CurrentUser;
  groups: BuyerGroup[];
  loading: boolean;
  onAddBuyer: (group: BuyerGroup, buyerID: string) => void;
  onCreateTeam: () => void;
  onDeleteTeam: (group: BuyerGroup) => void;
  onRemoveBuyer: (group: BuyerGroup, buyer: User) => void;
  onSetLead: (group: BuyerGroup, leadID: string) => void;
  teamleads: User[];
}) {
  const { t } = useI18n();
  const [buyerSelect, setBuyerSelect] = useState<Record<number, string>>({});

  if (loading) {
    return (
      <div className="border border-neutral-200 bg-white p-5 text-sm text-neutral-500 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        Loading teams...
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="border border-neutral-200 bg-white p-8 text-center shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          No teams yet. Create a team, then choose a teamlead and buyers.
        </p>
        {canCreate && (
          <Button
            className="mt-4 bg-[#45b84a] text-white hover:bg-[#3da442]"
            onClick={onCreateTeam}
          >
            <Plus className="h-4 w-4" />
            Create team
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {groups.map((group) => {
        const canEditTeam =
          currentUser.role === "admin" ||
          (currentUser.role === "teamlead" && group.lead_id === currentUser.id);
        const assignedIDs = new Set(group.buyers.map((buyer) => buyer.id));
        const availableBuyers = buyers.filter((buyer) => !assignedIDs.has(buyer.id));
        const selectedBuyerID = buyerSelect[group.id] ?? "";

        return (
          <section
            key={group.id}
            className="border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <UserAvatar avatarUrl={group.lead?.avatar_url} name={group.lead?.name ?? group.name} />
                <div className="min-w-0">
                  <h2 className="text-base font-semibold">{group.name}</h2>
                  <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                    {group.lead ? group.lead.email : "No teamlead selected"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge>{group.buyers.length} buyers</Badge>
                {currentUser.role === "admin" && (
                  <Button
                    aria-label={`Delete ${group.name}`}
                    size="icon-sm"
                    variant="ghost"
                    className="text-red-500 hover:bg-red-50 hover:text-red-600"
                    onClick={() => onDeleteTeam(group)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>

            {canEditTeam && (
              <div className="mt-4 space-y-3">
                <div className="space-y-2">
                  <Label htmlFor={`teamlead-${group.id}`}>Teamlead</Label>
                  <Select
                    id={`teamlead-${group.id}`}
                    value={group.lead_id ? String(group.lead_id) : ""}
                    onChange={(event) => onSetLead(group, event.target.value)}
                  >
                    <option value="">Select teamlead</option>
                    {teamleads.map((teamlead) => (
                      <option key={teamlead.id} value={teamlead.id}>
                        {teamlead.name}
                      </option>
                    ))}
                  </Select>
                </div>

                <div className="flex items-end gap-2">
                  <div className="min-w-0 flex-1 space-y-2">
                  <Label htmlFor={`buyer-${group.id}`}>{t("common.buyer")}</Label>
                    <Select
                      id={`buyer-${group.id}`}
                      disabled={!group.lead_id || availableBuyers.length === 0}
                      value={selectedBuyerID}
                      onChange={(event) =>
                        setBuyerSelect((current) => ({
                          ...current,
                          [group.id]: event.target.value,
                        }))
                      }
                    >
                      <option value="">
                        {group.lead_id ? "Select buyer" : "Choose a teamlead first"}
                      </option>
                      {availableBuyers.map((buyer) => (
                        <option key={buyer.id} value={buyer.id}>
                          {buyer.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <Button
                    disabled={!group.lead_id || !selectedBuyerID}
                    onClick={() => {
                      onAddBuyer(group, selectedBuyerID);
                      setBuyerSelect((current) => ({ ...current, [group.id]: "" }));
                    }}
                  >
                    <Plus className="h-4 w-4" />
                    {t("actions.add")}
                  </Button>
                </div>
              </div>
            )}

            <div className="mt-4 space-y-2">
              {group.buyers.length === 0 ? (
                <div className="rounded-md border border-dashed border-neutral-200 px-3 py-4 text-sm text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
                  No assigned buyers.
                </div>
              ) : (
                group.buyers.map((buyer) => (
                  <div
                    key={buyer.id}
                    className="flex items-center justify-between gap-3 border border-neutral-200 px-3 py-2 dark:border-neutral-800"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <UserAvatar avatarUrl={buyer.avatar_url} name={buyer.name} />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{buyer.name}</div>
                        <div className="truncate text-xs text-neutral-500 dark:text-neutral-400">
                          {buyer.email}
                        </div>
                      </div>
                    </div>
                    {canEditTeam && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onRemoveBuyer(group, buyer)}
                      >
                        Unassign
                      </Button>
                    )}
                  </div>
                ))
              )}
            </div>
          </section>
        );
      })}
    </div>
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
