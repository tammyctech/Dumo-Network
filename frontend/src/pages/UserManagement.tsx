import { useEffect, useState, type FormEvent } from "react";
import {
  Users,
  Search,
  RefreshCw,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  UserPlus,
  Copy,
  Link2,
  Loader2,
} from "lucide-react";

import { useAuth } from "../context/AuthContext";

const API_URL =
  import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

type UserRecord = {
  id: number;
  full_name: string;
  email: string;
  role: string;
  is_active: boolean;
};

type UsersResponse = {
  total: number;
  users: UserRecord[];
};

type AgentRecord = {
  id: number;
  full_name: string;
  email: string;
  phone_number: string | null;
  role: string;
  is_active: boolean;
};

type CreatedAgent = AgentRecord & {
  activation_url: string;
  invitation_expires_at: string;
};

type AgentForm = {
  full_name: string;
  email: string;
  phone_number: string;
};

const EMPTY_AGENT_FORM: AgentForm = {
  full_name: "",
  email: "",
  phone_number: "",
};

async function readApiError(response: Response): Promise<string> {
  try {
    const data: unknown = await response.json();

    if (
      typeof data === "object" &&
      data !== null &&
      "detail" in data
    ) {
      const detail = data.detail;

      if (typeof detail === "string") {
        return detail;
      }

      if (Array.isArray(detail)) {
        return detail
          .map((item: unknown) => {
            if (
              typeof item === "object" &&
              item !== null &&
              "msg" in item &&
              typeof item.msg === "string"
            ) {
              return item.msg;
            }
            return "Invalid input";
          })
          .join(", ");
      }
    }

    return `Request failed (${response.status})`;
  } catch {
    return `Request failed (${response.status})`;
  }
}

export default function UserManagement() {
  const { token, user } = useAuth();

  const isAdmin = user?.role === "admin";

  const [users, setUsers] = useState<UserRecord[]>([]);
  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [search, setSearch] = useState("");

  const [agentForm, setAgentForm] =
    useState<AgentForm>(EMPTY_AGENT_FORM);

  const [createdAgent, setCreatedAgent] =
    useState<CreatedAgent | null>(null);

  const [loading, setLoading] = useState(false);
  const [creatingAgent, setCreatingAgent] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [refreshKey, setRefreshKey] = useState(0);

  // Temporary diagnostic mode:
  // /admin/users?debug=1
  const debugMode =
    new URLSearchParams(window.location.search).get("debug") === "1";

  useEffect(() => {
    if (!token || !isAdmin) {
      setLoading(false);
      return;
    }

    const controller = new AbortController();

    async function loadData() {
      setLoading(true);
      setError("");

      try {
        const headers = {
          Authorization: `Bearer ${token}`,
        };

        const [usersResponse, agentsResponse] =
          await Promise.all([
            fetch(`${API_URL}/api/admin/users`, {
              headers,
              signal: controller.signal,
            }),
            fetch(`${API_URL}/api/admin/agents`, {
              headers,
              signal: controller.signal,
            }),
          ]);

        if (!usersResponse.ok) {
          throw new Error(
            `Users: ${await readApiError(usersResponse)}`
          );
        }

        if (!agentsResponse.ok) {
          throw new Error(
            `Agents: ${await readApiError(agentsResponse)}`
          );
        }

        const usersData: UsersResponse =
          await usersResponse.json();

        const agentsData: AgentRecord[] =
          await agentsResponse.json();

        if (!controller.signal.aborted) {
          setUsers(
            Array.isArray(usersData.users)
              ? usersData.users
              : []
          );

          setAgents(
            Array.isArray(agentsData)
              ? agentsData
              : []
          );
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(
            err instanceof Error
              ? err.message
              : "Unable to load user management data."
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadData();

    return () => controller.abort();
  }, [token, isAdmin, refreshKey]);

  async function createAgent(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (!token || !isAdmin || creatingAgent) {
      return;
    }

    setError("");
    setSuccess("");

    const fullName = agentForm.full_name.trim();
    const email = agentForm.email.trim().toLowerCase();
    const phoneNumber = agentForm.phone_number.trim();

    if (fullName.length < 2) {
      setError("Enter the agent's full name.");
      return;
    }

    if (!email.includes("@")) {
      setError("Enter a valid email address.");
      return;
    }

    if (!phoneNumber) {
      setError("Enter the agent's phone number.");
      return;
    }

    setCreatingAgent(true);

    try {
      const response = await fetch(
        `${API_URL}/api/admin/agents`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            full_name: fullName,
            email,
            phone_number: phoneNumber,
          }),
        }
      );

      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

      const data: CreatedAgent = await response.json();

      setCreatedAgent(data);
      setAgentForm(EMPTY_AGENT_FORM);

      setSuccess(
        `${data.full_name} was registered successfully.`
      );

      setRefreshKey((value) => value + 1);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to create agent."
      );
    } finally {
      setCreatingAgent(false);
    }
  }

  async function copyActivationLink() {
    if (!createdAgent) return;

    try {
      await navigator.clipboard.writeText(
        createdAgent.activation_url
      );

      setSuccess("Activation link copied successfully.");
      setError("");
    } catch {
      setError(
        "Could not copy the link. Please copy it manually."
      );
    }
  }

  const query = search.trim().toLowerCase();

  const filteredUsers = users.filter((item) => {
    return (
      (item.full_name || "").toLowerCase().includes(query) ||
      (item.email || "").toLowerCase().includes(query) ||
      (item.role || "").toLowerCase().includes(query)
    );
  });

  const totalObservers = users.filter(
    (item) => item.role === "observer"
  ).length;

  const activeAgents = agents.filter(
    (agent) => agent.is_active
  ).length;

  const pendingAgents = agents.filter(
    (agent) => !agent.is_active
  ).length;

  // ==========================================
  // DEBUG MODE
  // ==========================================

  if (debugMode) {
    return (
      <div
        style={{
          background: "#ffffff",
          color: "#111827",
          padding: "32px",
          minHeight: "400px",
          border: "3px solid #dc2626",
          borderRadius: "12px",
        }}
      >
        <h1
          style={{
            fontSize: "28px",
            fontWeight: "bold",
            color: "#dc2626",
          }}
        >
          USER MANAGEMENT TEST
        </h1>

        <p style={{ marginTop: "16px" }}>
          React component is rendering successfully.
        </p>

        <p style={{ marginTop: "12px" }}>
          <strong>Current role:</strong>{" "}
          {user?.role ?? "No user loaded"}
        </p>

        <p style={{ marginTop: "12px" }}>
          <strong>Authentication token:</strong>{" "}
          {token ? "Present" : "Missing"}
        </p>

        <p style={{ marginTop: "12px" }}>
          <strong>Administrator:</strong>{" "}
          {isAdmin ? "Yes" : "No"}
        </p>

        <p style={{ marginTop: "12px" }}>
          <strong>API URL:</strong> {API_URL}
        </p>

        <p style={{ marginTop: "12px" }}>
          <strong>Loading:</strong>{" "}
          {loading ? "Yes" : "No"}
        </p>

        <p style={{ marginTop: "12px" }}>
          <strong>Users loaded:</strong> {users.length}
        </p>

        <p style={{ marginTop: "12px" }}>
          <strong>Agents loaded:</strong> {agents.length}
        </p>

        {error && (
          <p
            style={{
              marginTop: "16px",
              color: "#b91c1c",
              fontWeight: "bold",
            }}
          >
            API Error: {error}
          </p>
        )}

        <p style={{ marginTop: "24px" }}>
          Remove <code>?debug=1</code> from the address
          to display the normal interface.
        </p>
      </div>
    );
  }

  // ==========================================
  // ADMIN ACCESS
  // ==========================================

  if (!isAdmin) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6">
        <h1 className="text-xl font-bold text-red-800">
          Access Restricted
        </h1>

        <p className="mt-2 text-sm text-red-700">
          Only administrators can manage user accounts.
        </p>
      </div>
    );
  }

  // ==========================================
  // MAIN INTERFACE
  // ==========================================

  return (
    <div className="space-y-6 p-2 text-slate-900">

      {/* HEADER */}

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">
            User Management
          </h1>

          <p className="mt-2 text-sm text-slate-500">
            Manage users and polling-unit agents.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setRefreshKey((value) => value + 1)}
          disabled={loading}
          className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw
            size={17}
            className={loading ? "animate-spin" : ""}
          />
          Refresh
        </button>
      </div>

      {/* ERROR */}

      {error && (
        <div
          role="alert"
          className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          <AlertCircle size={18} />
          {error}
        </div>
      )}

      {/* SUCCESS */}

      {success && (
        <div
          role="status"
          className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700"
        >
          <CheckCircle2 size={18} />
          {success}
        </div>
      )}

      {/* STATISTICS */}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {[
          { label: "Total Users", value: users.length },
          { label: "Agents", value: agents.length },
          { label: "Observers", value: totalObservers },
          { label: "Active Agents", value: activeAgents },
          { label: "Pending Agents", value: pendingAgents },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500">
                {card.label}
              </p>
              <Users size={20} className="text-emerald-600" />
            </div>

            <p className="mt-3 text-3xl font-bold">
              {loading ? "..." : card.value}
            </p>
          </div>
        ))}
      </div>

      {/* REGISTER AGENT */}

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-slate-50 p-5">
          <div className="flex items-center gap-3">
            <UserPlus
              size={24}
              className="text-emerald-600"
            />

            <div>
              <h2 className="text-lg font-semibold">
                Register Polling-Unit Agent
              </h2>

              <p className="text-sm text-slate-500">
                Create an agent account and generate
                an activation link.
              </p>
            </div>
          </div>
        </div>

        <form
          onSubmit={createAgent}
          className="space-y-5 p-5"
        >
          <div className="grid gap-5 md:grid-cols-3">
            <div>
              <label
                htmlFor="agent-name"
                className="mb-2 block text-sm font-medium"
              >
                Full Name
              </label>

              <input
                id="agent-name"
                type="text"
                required
                minLength={2}
                maxLength={150}
                value={agentForm.full_name}
                onChange={(event) =>
                  setAgentForm((previous) => ({
                    ...previous,
                    full_name: event.target.value,
                  }))
                }
                placeholder="Agent full name"
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label
                htmlFor="agent-email"
                className="mb-2 block text-sm font-medium"
              >
                Email Address
              </label>

              <input
                id="agent-email"
                type="email"
                required
                value={agentForm.email}
                onChange={(event) =>
                  setAgentForm((previous) => ({
                    ...previous,
                    email: event.target.value,
                  }))
                }
                placeholder="agent@example.com"
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label
                htmlFor="agent-phone"
                className="mb-2 block text-sm font-medium"
              >
                Phone Number
              </label>

              <input
                id="agent-phone"
                type="tel"
                required
                value={agentForm.phone_number}
                onChange={(event) =>
                  setAgentForm((previous) => ({
                    ...previous,
                    phone_number: event.target.value,
                  }))
                }
                placeholder="08012345678"
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={creatingAgent}
            className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {creatingAgent ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <UserPlus size={18} />
            )}

            {creatingAgent
              ? "Creating Agent..."
              : "Create Agent"}
          </button>
        </form>
      </section>

      {/* ACTIVATION LINK */}

      {createdAgent && (
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
          <div className="flex items-center gap-2">
            <Link2 size={21} className="text-emerald-700" />

            <h2 className="font-semibold text-emerald-900">
              Agent Activation Link
            </h2>
          </div>

          <p className="mt-3 text-sm text-emerald-800">
            Agent: <strong>{createdAgent.full_name}</strong>
          </p>

          <p className="mt-1 text-sm text-emerald-800">
            Email: {createdAgent.email}
          </p>

          <p className="mt-3 text-sm text-emerald-800">
            Expires:{" "}
            {new Date(
              createdAgent.invitation_expires_at
            ).toLocaleString()}
          </p>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <input
              type="text"
              readOnly
              aria-label="Agent activation link"
              value={createdAgent.activation_url}
              className="min-w-0 flex-1 rounded-xl border border-emerald-200 bg-white px-4 py-3 text-sm"
            />

            <button
              type="button"
              onClick={copyActivationLink}
              className="flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 py-3 text-sm font-medium text-white hover:bg-emerald-800"
            >
              <Copy size={17} />
              Copy Link
            </button>
          </div>

          <p className="mt-3 text-xs text-emerald-800">
            This is a sensitive one-time link.
            Share it only with the intended agent.
          </p>

          <button
            type="button"
            onClick={() => setCreatedAgent(null)}
            className="mt-3 text-sm font-medium text-emerald-800 underline"
          >
            Dismiss activation link
          </button>
        </section>
      )}

      {/* REGISTERED AGENTS */}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-slate-200 p-5">
          <ShieldCheck size={21} className="text-emerald-600" />

          <h2 className="font-semibold">
            Registered Agents
          </h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[650px] text-left text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-5 py-4">Name</th>
                <th className="px-5 py-4">Email</th>
                <th className="px-5 py-4">Phone</th>
                <th className="px-5 py-4">Status</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {agents.map((agent) => (
                <tr key={agent.id}>
                  <td className="px-5 py-4 font-medium">
                    {agent.full_name}
                  </td>

                  <td className="px-5 py-4">
                    {agent.email}
                  </td>

                  <td className="px-5 py-4">
                    {agent.phone_number ?? "—"}
                  </td>

                  <td className="px-5 py-4">
                    <span
                      className={
                        agent.is_active
                          ? "rounded-full bg-emerald-50 px-3 py-1 text-xs text-emerald-700"
                          : "rounded-full bg-amber-50 px-3 py-1 text-xs text-amber-700"
                      }
                    >
                      {agent.is_active
                        ? "Active"
                        : "Pending Activation"}
                    </span>
                  </td>
                </tr>
              ))}

              {!loading && agents.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-5 py-10 text-center text-slate-500"
                  >
                    No agents registered yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* REGISTERED USERS */}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 p-5">
          <div className="flex items-center gap-2">
            <Users size={21} className="text-emerald-600" />

            <h2 className="font-semibold">
              Registered Users
            </h2>
          </div>

          <div className="relative w-full sm:w-72">
            <Search
              size={17}
              className="absolute left-3 top-3 text-slate-400"
            />

            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search name, email, or role"
              className="w-full rounded-xl border border-slate-300 py-2.5 pl-10 pr-4 text-sm"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-5 py-4">Name</th>
                <th className="px-5 py-4">Email</th>
                <th className="px-5 py-4">Role</th>
                <th className="px-5 py-4">Status</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {filteredUsers.map((item) => (
                <tr key={item.id}>
                  <td className="px-5 py-4 font-medium">
                    {item.full_name}
                  </td>

                  <td className="px-5 py-4">
                    {item.email}
                  </td>

                  <td className="px-5 py-4 capitalize">
                    {item.role}
                  </td>

                  <td className="px-5 py-4">
                    <span
                      className={
                        item.is_active
                          ? "rounded-full bg-emerald-50 px-3 py-1 text-xs text-emerald-700"
                          : "rounded-full bg-red-50 px-3 py-1 text-xs text-red-700"
                      }
                    >
                      {item.is_active
                        ? "Active"
                        : "Inactive"}
                    </span>
                  </td>
                </tr>
              ))}

              {!loading && filteredUsers.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-5 py-10 text-center text-slate-500"
                  >
                    No users found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}