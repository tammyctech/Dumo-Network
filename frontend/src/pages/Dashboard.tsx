import { useCallback, useEffect, useState } from "react";

import {
  ArrowRight,
  Activity,
  AlertCircle,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Clock3,
  ClipboardList,
  MapPin,
  RefreshCw,
  Users,
  Vote,
} from "lucide-react";
import { Link } from "react-router-dom";

import {

  Bar,

  BarChart,

  CartesianGrid,

  Cell,

  Legend,

  ResponsiveContainer,

  Tooltip,

  XAxis,

  YAxis,

} from "recharts";

import { useAuth } from "../context/AuthContext";

// ==========================================

// API CONFIGURATION

// ==========================================

const API_URL =

  import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

// ==========================================

// TYPES

// ==========================================

type Election = {

  id: number;

  name: string;

  election_date: string;

};

type PartyTotal = {

  party: string;

  votes: number;

};

type LgaProgress = {

  lga: string;

  total_polling_units: number;

  submitted_polling_units: number;

  coverage_percent: number | null;
};

type RecentSubmission = {
  id: number;
  submitted_at: string;
  lga: string;
  ward: string;
  polling_unit_name: string;
  polling_unit_code: string;
};

type DashboardStatistics = {

  state: string;

  data_type: string;

  election: Election | null;

  total_polling_units: number;
  assigned_polling_units: number;
  submitted_polling_units: number;
  missing_assigned_polling_units: number;

  submission_coverage_percent: number | null;

  accredited_voters: number | null;

  valid_votes: number | null;

  rejected_votes: number | null;

  verification_summary: Record<string, number> | null;
  active_flags: number | null;
  open_incidents: number | null;

  party_totals: PartyTotal[];
  lga_progress: LgaProgress[];
  recent_submissions: RecentSubmission[];
  message?: string;
};

// ==========================================

// UTILITIES

// ==========================================

function formatNumber(value: number | null | undefined) {

  if (value === null || value === undefined) {

    return "—";

  }

  return value.toLocaleString("en-NG");

}

function formatPercent(value: number | null | undefined) {

  if (value === null || value === undefined) {

    return "—";

  }

  return `${value.toFixed(2)}%`;

}

function formatDate(value: string | undefined) {

  if (!value) {

    return "Not available";

  }

const date = new Date(value);

  if (Number.isNaN(date.getTime())) {

    return "Not available";

  }

  return date.toLocaleDateString("en-NG", {

    day: "numeric",

    month: "long",

    year: "numeric",

  });

}

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Time unavailable";
  }

  return date.toLocaleString("en-NG", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function readApiError(response: Response) {

  try {

const data = await response.json();

    if (typeof data.detail === "string") {

      return data.detail;

    }

  } catch {

    // Use the fallback message below.

  }

  return `Request failed (${response.status})`;

}

// ==========================================

// STAT CARD

// ==========================================

type StatCardProps = {

  title: string;

  value: string;

  description: string;

  icon: React.ComponentType<{

    size?: number;

    className?: string;

  }>;

};

function StatCard({

title,

value,

description,

  icon: Icon,

}: StatCardProps) {

  return (

    <div className="group min-w-0 w-full rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md sm:p-5">

      <div className="flex min-w-0 items-start justify-between gap-3">

        <div className="min-w-0 flex-1">

          <p className="whitespace-normal break-words text-[13px] font-medium leading-relaxed text-slate-500">

            {title}

          </p>

          <p className="mt-3 break-words text-[28px] font-semibold leading-tight tracking-tight text-slate-900 sm:text-3xl">

            {value}

          </p>

        </div>

        <div className="shrink-0 rounded-xl bg-emerald-50 p-3 text-emerald-700 ring-1 ring-emerald-100 transition group-hover:bg-emerald-100">

          <Icon size={22} />

        </div>

      </div>

      <p className="mt-4 whitespace-normal break-words border-t border-slate-100 pt-3 text-xs leading-relaxed text-slate-500">

        {description}

      </p>

    </div>

  );

}

function DashboardSkeleton() {
  return (
    <div role="status" aria-label="Loading election monitoring statistics" className="space-y-6">
      <span className="sr-only">Loading election monitoring statistics…</span>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div
            key={index}
            aria-hidden="true"
            className="h-36 animate-pulse rounded-2xl border border-slate-200 bg-white p-5"
          >
            <div className="h-4 w-2/5 rounded bg-slate-100" />
            <div className="mt-5 h-8 w-1/3 rounded bg-slate-100" />
            <div className="mt-5 h-3 w-4/5 rounded bg-slate-100" />
          </div>
        ))}
      </div>
      <div aria-hidden="true" className="h-44 animate-pulse rounded-2xl border border-slate-200 bg-white p-6">
        <div className="h-5 w-1/3 rounded bg-slate-100" />
        <div className="mt-4 h-3 w-2/3 rounded bg-slate-100" />
        <div className="mt-7 h-4 rounded-full bg-slate-100" />
      </div>
      <div aria-hidden="true" className="h-72 animate-pulse rounded-2xl border border-slate-200 bg-white p-6">
        <div className="h-5 w-1/4 rounded bg-slate-100" />
        <div className="mt-4 h-3 w-1/2 rounded bg-slate-100" />
        <div className="mt-8 h-40 rounded-xl bg-slate-100" />
      </div>
    </div>
  );
}

// ==========================================
// DASHBOARD
// ==========================================

export default function Dashboard() {

const { token, user } = useAuth();

const [statistics, setStatistics] =

    useState<DashboardStatistics | null>(null);

const [elections, setElections] = useState<Election[]>([]);

const [selectedElectionId, setSelectedElectionId] =

    useState<string>("");

const [loading, setLoading] = useState(true);

const [refreshing, setRefreshing] = useState(false);

const [error, setError] = useState("");

const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // ========================================

  // LOAD ELECTION OPTIONS

  // ========================================

  useEffect(() => {

    if (!token || user?.role !== "admin") {

      return;

    }

const controller = new AbortController();

    async function loadElections() {

      try {

const response = await fetch(

          `${API_URL}/api/admin/elections`,

          {

            headers: {

              Authorization: `Bearer ${token}`,

            },

            signal: controller.signal,

          }

        );

        if (!response.ok) {

          return;

        }

const data = await response.json();

        // Expected from the Step 15 admin options API:

        // { state: "Rivers", elections: [...] }

        if (

          data.state === "Rivers" &&

          Array.isArray(data.elections)

        ) {

          setElections(data.elections);

        }

      } catch {

        // Election selector is optional.

        // The dashboard statistics endpoint remains usable.

      }

    }

    loadElections();

    return () => controller.abort();

  }, [token, user?.role]);

  // ========================================

  // LOAD DASHBOARD STATISTICS

  // ========================================

const loadStatistics = useCallback(

    async (signal?: AbortSignal, manualRefresh = false) => {

      if (!token) {

        setLoading(false);

        return;

      }

      if (manualRefresh) {

        setRefreshing(true);

      } else {

        setLoading(true);

      }

      setError("");

      try {

const query = selectedElectionId

          ? `?election_id=${encodeURIComponent(selectedElectionId)}`

          : "";

const response = await fetch(

          `${API_URL}/api/dashboard/statistics${query}`,

          {

            headers: {

              Authorization: `Bearer ${token}`,

            },

            signal,

          }

        );

        if (!response.ok) {

          throw new Error(await readApiError(response));

        }

const data: DashboardStatistics = await response.json();

        if (data.state !== "Rivers") {

          throw new Error(

            "This dashboard supports Rivers State only."

          );

        }

        if (data.data_type !== "unofficial_agent_submitted") {

          throw new Error(

            "Unexpected election data classification."

          );

        }

        if (!signal?.aborted) {

          setStatistics(data);

          setLastUpdated(new Date());

        }

      } catch (err) {

        if (!signal?.aborted) {

          setError(

            err instanceof Error

              ? err.message

              : "Unable to load dashboard statistics."

          );

        }

      } finally {

        if (!signal?.aborted) {

          setLoading(false);

          setRefreshing(false);

        }

      }

    },

    [token, selectedElectionId]

  );

  useEffect(() => {

const controller = new AbortController();

    loadStatistics(controller.signal);

    return () => controller.abort();

  }, [loadStatistics]);

  // ========================================

  // CHART DATA

  // ========================================

const partyData = statistics?.party_totals ?? [];

const lgaData = statistics?.lga_progress ?? [];

const sortedLgaData = [...lgaData].sort(

    (a, b) =>

      (b.coverage_percent ?? -1) -

      (a.coverage_percent ?? -1)

  );
const missingAssignedUnits =
  statistics?.missing_assigned_polling_units ?? 0;
const alertsAreAvailable = Boolean(
  statistics &&
    statistics.active_flags !== null &&
    statistics.open_incidents !== null
);
const workflowUnavailableMessage = statistics?.election
  ? "Unavailable until the operations workflow migration is applied."
  : "No election is available for this metric.";

  // ========================================

  // RENDER

  // ========================================

  return (

    <div className="w-full min-w-0 max-w-full space-y-6 break-words">
      {/* =====================================

          HEADER

      ===================================== */}

      <div className="flex min-w-0 flex-wrap items-start justify-between gap-4">

        <div>

          <div className="flex items-center gap-2 text-emerald-700">

            <Activity size={16} />

            <span className="text-[11px] font-bold uppercase tracking-[0.16em]">

              Rivers State Monitoring

            </span>

          </div>

          <h1 className="mt-2 text-[26px] font-semibold leading-tight tracking-tight text-slate-950 sm:text-3xl">

            Election Monitoring Dashboard

          </h1>

          <p className="mt-2 text-[13px] leading-6 text-slate-500">

            Polling-unit submissions and election monitoring statistics.

          </p>

        </div>

        <button

          type="button"

          onClick={() => loadStatistics(undefined, true)}

          disabled={loading || refreshing}

          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-[13px] font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50"

        >

          <RefreshCw

            size={17}

            className={refreshing ? "animate-spin" : ""}

          />

          {refreshing ? "Refreshing..." : "Refresh"}

        </button>

      </div>

      {/* =====================================

          UNOFFICIAL DATA NOTICE

      ===================================== */}

      <div className="rounded-2xl border border-amber-200/80 bg-amber-50/80 p-4 sm:p-5">

        <div className="flex items-start gap-3">

          <AlertCircle

            size={22}

            className="mt-0.5 shrink-0 text-amber-700"

          />

          <div>

            <h2 className="font-bold text-amber-900">

              Unofficial — Agent-Submitted Data

            </h2>

            <p className="mt-2 text-sm leading-6 text-amber-800">

              These statistics are compiled from submissions

              entered by assigned election monitoring agents.

              They do not represent official election results

              or an official declaration of winners.

            </p>

          </div>

        </div>

      </div>

      {/* =====================================

          ERROR

      ===================================== */}

      {error && (
        <div

          role="alert"

          className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"

        >

          <div className="flex items-center gap-2">

            <AlertCircle size={18} />

            <span>{error}</span>

          </div>

          <button
            type="button"
            onClick={() => loadStatistics(undefined, true)}
            disabled={refreshing}
            className="mt-3 min-h-11 rounded-lg bg-red-700 px-4 py-2 text-xs font-semibold text-white hover:bg-red-800 disabled:opacity-60"
          >
            {refreshing ? "Retrying…" : "Try again"}
          </button>
        </div>
      )}

      {/* =====================================

          LOADING

      ===================================== */}

      {loading && (
        <DashboardSkeleton />
      )}

      {/* =====================================

          DASHBOARD CONTENT

      ===================================== */}

      {!loading && !error && statistics && (

        <>

          {/* ELECTION INFORMATION */}

          <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)] sm:p-6">

            <div className="flex flex-wrap items-center justify-between gap-5">

              <div>

                <div className="flex items-center gap-2">

                  <CalendarDays

                    size={19}

                    className="text-emerald-600"

                  />

                  <h2 className="text-sm font-semibold text-slate-800">

                    Current Election

                  </h2>

                </div>

                <p className="mt-3 break-words text-lg font-semibold tracking-tight text-slate-950 sm:text-xl">

                  {statistics.election?.name ??

                    "No election created"}

                </p>

                <p className="mt-1 text-sm text-slate-500">

                  {formatDate(

                    statistics.election?.election_date

                  )}

                </p>

              </div>

              {user?.role === "admin" && elections.length > 0 && (

                <div className="min-w-0 w-full sm:w-72">

                  <label

                    htmlFor="election-select"

                    className="mb-2 block text-xs font-semibold text-slate-600"

                  >

                    Select Election

                  </label>

                  <select

                    id="election-select"

                    value={selectedElectionId}

                    onChange={(event) =>

                      setSelectedElectionId(event.target.value)

                    }

                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm"

                  >

                    <option value="">

                      Latest election

                    </option>

                    {elections.map((election) => (

                      <option

                        key={election.id}

                        value={election.id}

                      >

                        {election.name}

                      </option>

                    ))}

                  </select>

                </div>

              )}

            </div>

            {lastUpdated && (

              <p className="mt-4 text-xs text-slate-400">

                Last updated:{" "}

                {lastUpdated.toLocaleString("en-NG")}

              </p>

            )}

          </section>

          {/* NO ELECTION NOTICE */}

          {!statistics.election && (

            <div className="rounded-xl border border-blue-200 bg-blue-50 p-5">

              <p className="font-semibold text-blue-900">

                No election has been created yet.

              </p>

              <p className="mt-2 text-sm text-blue-800">

                An administrator must create a Rivers State

                election before result submissions can begin.

              </p>

            </div>

          )}

          {/* OPERATIONS AND QUICK ACTIONS */}

          <section className="grid min-w-0 gap-5 xl:grid-cols-2">
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
              <div className="flex items-start gap-3">
                <span className="rounded-xl bg-amber-50 p-2.5 text-amber-700">
                  <AlertCircle size={19} />
                </span>
                <div>
                  <h2 className="font-semibold text-slate-900">
                    Monitoring alerts
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Based on current assignment and workflow records.
                  </p>
                </div>
              </div>
              <div className="mt-5 space-y-3">
                {!statistics.election ? (
                  <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
                    Alerts will appear after a Rivers State election is created.
                  </p>
                ) : (
                  <>
                    {statistics.assigned_polling_units === 0 && (
                      <Link
                        to={
                          user?.role === "admin"
                            ? "/admin/assignments"
                            : "/agent-results"
                        }
                        className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-sm text-amber-950 hover:bg-amber-50"
                      >
                        <span>No polling units are assigned for this election</span>
                        <ArrowRight size={17} className="shrink-0" />
                      </Link>
                    )}
                    {missingAssignedUnits > 0 && (
                      <Link
                        to={
                          user?.role === "admin"
                            ? "/admin/assignments"
                            : "/agent-results"
                        }
                        className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-sm text-amber-950 hover:bg-amber-50"
                      >
                        <span>
                          <strong>{formatNumber(missingAssignedUnits)}</strong>{" "}
                          assigned polling units have no submission
                        </span>
                        <ArrowRight size={17} className="shrink-0" />
                      </Link>
                    )}
                    {statistics.active_flags !== null &&
                      statistics.active_flags > 0 && (
                        <Link
                          to="/results"
                          className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 hover:bg-red-100"
                        >
                          <span>
                            <strong>{formatNumber(statistics.active_flags)}</strong>{" "}
                            unresolved result flags
                          </span>
                          <ArrowRight size={17} className="shrink-0" />
                        </Link>
                      )}
                    {statistics.open_incidents !== null &&
                      statistics.open_incidents > 0 && (
                        <Link
                          to="/incidents"
                          className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 hover:bg-red-100"
                        >
                          <span>
                            <strong>{formatNumber(statistics.open_incidents)}</strong>{" "}
                            open or investigating incidents
                          </span>
                          <ArrowRight size={17} className="shrink-0" />
                        </Link>
                      )}
                    {missingAssignedUnits === 0 &&
                      statistics.assigned_polling_units > 0 &&
                      alertsAreAvailable &&
                      statistics.active_flags === 0 &&
                      statistics.open_incidents === 0 && (
                        <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                          No outstanding alerts in the current monitoring data.
                        </p>
                      )}
                    {!alertsAreAvailable && (
                      <p className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                        Some workflow alerts are unavailable until the operations workflow migration is applied.
                      </p>
                    )}
                    {missingAssignedUnits === 0 &&
                      statistics.assigned_polling_units > 0 &&
                      alertsAreAvailable &&
                      statistics.active_flags === 0 &&
                      statistics.open_incidents === 0 && (
                        <p className="text-xs text-slate-500">
                          Alert counts reflect available records, not official verification.
                        </p>
                      )}
                  </>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
              <h2 className="font-semibold text-slate-900">Quick actions</h2>
              <p className="mt-1 text-sm text-slate-500">
                Shortcuts to your election monitoring tasks.
              </p>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {user?.role === "admin" ? (
                  <>
                    <Link
                      to="/admin/elections"
                      className="flex min-h-12 items-center justify-between gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:border-emerald-300 hover:bg-emerald-50"
                    >
                      Manage elections <ArrowRight size={16} />
                    </Link>
                    <Link
                      to="/admin/assignments"
                      className="flex min-h-12 items-center justify-between gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:border-emerald-300 hover:bg-emerald-50"
                    >
                      Assign agents <ArrowRight size={16} />
                    </Link>
                    <Link
                      to="/results"
                      className="flex min-h-12 items-center justify-between gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:border-emerald-300 hover:bg-emerald-50"
                    >
                      Review submissions <ArrowRight size={16} />
                    </Link>
                    <Link
                      to="/admin/notifications"
                      className="flex min-h-12 items-center justify-between gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:border-emerald-300 hover:bg-emerald-50"
                    >
                      Notification centre <ArrowRight size={16} />
                    </Link>
                  </>
                ) : user?.role === "agent" ? (
                  <>
                    <Link
                      to="/agent-results"
                      className="flex min-h-12 items-center justify-between gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:border-emerald-300 hover:bg-emerald-50"
                    >
                      Submit a result <ArrowRight size={16} />
                    </Link>
                    <Link
                      to="/incidents"
                      className="flex min-h-12 items-center justify-between gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:border-emerald-300 hover:bg-emerald-50"
                    >
                      Report an incident <ArrowRight size={16} />
                    </Link>
                  </>
                ) : null}
                <Link
                  to="/analytics"
                  className="flex min-h-12 items-center justify-between gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:border-emerald-300 hover:bg-emerald-50"
                >
                  View analytics <ArrowRight size={16} />
                </Link>
              </div>
            </div>
          </section>

          {/* RECENT SUBMISSIONS */}

          <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold text-slate-900">
                  Recent submissions
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Latest agent reports for the selected election.
                </p>
              </div>
              {(user?.role === "admin" || user?.role === "agent") && (
                <Link
                  to="/results"
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-emerald-800 hover:bg-emerald-50"
                >
                  View results <ArrowRight size={16} />
                </Link>
              )}
            </div>
            {statistics.recent_submissions.length === 0 ? (
              <p className="mt-5 rounded-xl bg-slate-50 p-5 text-sm text-slate-600">
                No submissions have been received for this election yet.
              </p>
            ) : (
              <ul className="mt-4 divide-y divide-slate-100">
                {statistics.recent_submissions.map((submission) => (
                  <li
                    key={submission.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-4 first:pt-2 last:pb-2"
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="mt-0.5 rounded-lg bg-emerald-50 p-2 text-emerald-700">
                        <ClipboardList size={17} />
                      </span>
                      <div className="min-w-0">
                        <p className="break-words text-sm font-semibold text-slate-900">
                          {submission.polling_unit_name}
                        </p>
                        <p className="mt-1 break-words text-xs text-slate-500">
                          {submission.polling_unit_code} · {submission.ward},{" "}
                          {submission.lga}
                        </p>
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-slate-500">
                      <Clock3 size={14} />
                      {formatDateTime(submission.submitted_at)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* SUMMARY CARDS */}

          <section className="grid min-w-0 grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">

            <StatCard

              title="Total Polling Units"

              value={formatNumber(

                statistics.total_polling_units

              )}

              description="Rivers State polling units in the database."

              icon={MapPin}

            />

            <StatCard

              title="Assigned Polling Units"

              value={

                statistics.election

                  ? formatNumber(

                      statistics.assigned_polling_units

                    )

                  : "—"

              }

              description="Distinct polling units assigned to agents."

              icon={Users}

            />

            <StatCard

              title="Submitted Polling Units"

              value={

                statistics.election

                  ? formatNumber(

                      statistics.submitted_polling_units

                    )

                  : "—"

              }

              description="Distinct polling units with submissions."

              icon={ClipboardList}

            />

            <StatCard

              title="Submission Coverage"

              value={formatPercent(

                statistics.submission_coverage_percent

              )}

              description="Submitted polling units divided by total polling units."

              icon={CheckCircle2}

            />

          </section>

          {/* VOTE STATISTICS */}

          <section className="grid min-w-0 grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              title="Verified Results"
              value={formatNumber(
                statistics.verification_summary
                  ? statistics.verification_summary.verified ?? 0
                  : null
              )}
              description={
                statistics.verification_summary
                  ? "Submissions approved through the review workflow."
                  : workflowUnavailableMessage
              }
              icon={CheckCircle2}
            />
            <StatCard
              title="Pending Review"
              value={formatNumber(
                statistics.verification_summary
                  ? (statistics.verification_summary.submitted ?? 0) +
                    (statistics.verification_summary.under_review ?? 0)
                  : null
              )}
              description={
                statistics.verification_summary
                  ? "Submitted results still awaiting a final review decision."
                  : workflowUnavailableMessage
              }
              icon={ClipboardList}
            />
            <StatCard
              title="Active Anomaly Flags"
              value={formatNumber(statistics.active_flags)}
              description={
                statistics.active_flags === null
                  ? workflowUnavailableMessage
                  : "Automated data-quality observations requiring attention."
              }
              icon={AlertCircle}
            />
            <StatCard
              title="Open Incidents"
              value={formatNumber(statistics.open_incidents)}
              description={
                statistics.open_incidents === null
                  ? workflowUnavailableMessage
                  : "Operational incidents currently open or under investigation."
              }
              icon={Activity}
            />
          </section>

          {/* VOTE STATISTICS */}

          <section className="grid min-w-0 grid-cols-1 gap-5 sm:grid-cols-3">

            <StatCard

              title="Accredited Voters"

              value={formatNumber(

                statistics.accredited_voters

              )}

              description="Total reported by monitoring agents."

              icon={Users}

            />

            <StatCard

              title="Valid Votes"

              value={formatNumber(

                statistics.valid_votes

              )}

              description="Total valid votes from submitted results."

              icon={Vote}

            />

            <StatCard

              title="Rejected Votes"

              value={formatNumber(

                statistics.rejected_votes

              )}

              description="Total rejected votes from submitted results."

              icon={BarChart3}

            />

          </section>

          {/* SUBMISSION COVERAGE BAR */}

          <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)] sm:p-6">

            <h2 className="text-lg font-semibold tracking-tight text-slate-900">

              Polling-Unit Submission Coverage

            </h2>

            <p className="mt-2 text-sm text-slate-500">

              Percentage of Rivers State polling units with

              agent-submitted results.

            </p>

            {statistics.submission_coverage_percent === null ? (
              <p className="mt-6 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                Coverage is unavailable because no polling-unit denominator is available.
              </p>
            ) : (
              <div
                className="mt-6 h-4 overflow-hidden rounded-full bg-slate-100"
                role="progressbar"
                aria-label="Polling-unit submission coverage"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.min(
                  100,
                  Math.max(0, statistics.submission_coverage_percent)
                )}
              >
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                  style={{
                    width: `${Math.min(100, Math.max(0, statistics.submission_coverage_percent))}%`,
                  }}
                />
              </div>
            )}

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">

              <span className="text-slate-500">

                {formatNumber(

                  statistics.submitted_polling_units

                )}{" "}

                submitted

              </span>

              <span className="font-bold text-emerald-700">

                {formatPercent(

                  statistics.submission_coverage_percent

                )}

              </span>

            </div>

          </section>

          {/* PARTY RESULTS */}

          <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)] sm:p-6">

            <div className="flex items-center gap-3">

              <BarChart3

                size={21}

                className="text-emerald-600"

              />

              <h2 className="text-lg font-bold text-slate-900">

                Unofficial Party Vote Totals

              </h2>

            </div>

            <p className="mt-2 text-sm text-slate-500">

              Aggregated votes from agent-submitted polling-unit

              results. These are not official election totals.

            </p>

            {partyData.length === 0 ? (

              <div className="py-12 text-center text-sm text-slate-500">

                No party vote submissions are available yet.

              </div>

            ) : (

              <div className="mt-6 h-80 min-w-0 w-full">

                <ResponsiveContainer width="100%" height="100%">

                  <BarChart

                    data={partyData}

                    margin={{

                      top: 10,

                      right: 20,

                      left: 0,

                      bottom: 10,

                    }}

                  >

                    <CartesianGrid

                      strokeDasharray="3 3"

                      vertical={false}

                    />

                    <XAxis dataKey="party" />

                    <YAxis

                      allowDecimals={false}

                      tickFormatter={(value) =>

                        Number(value).toLocaleString("en-NG")

                      }

                    />

                    <Tooltip

                      formatter={(value) =>

                        Number(value).toLocaleString("en-NG")

                      }

                    />

                    <Legend />

                    <Bar

                      dataKey="votes"

                      name="Agent-Submitted Votes"

                      radius={[6, 6, 0, 0]}

                    >

                      {partyData.map((entry, index) => (

                        <Cell

                          key={`${entry.party}-${index}`}

                          fill="#10b981"

                        />

                      ))}

                    </Bar>

                  </BarChart>

                </ResponsiveContainer>

              </div>

            )}

          </section>

          {/* LGA MONITORING */}

          <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)]">

            <div className="border-b border-slate-200 p-6">

              <h2 className="text-lg font-bold text-slate-900">

                LGA Submission Progress

              </h2>

              <p className="mt-2 text-sm text-slate-500">

                Polling-unit submission coverage by Local

                Government Area in Rivers State.

              </p>

            </div>

            {sortedLgaData.length === 0 ? (

              <div className="p-10 text-center text-sm text-slate-500">

                No LGA monitoring data is available yet.

              </div>

            ) : (

              <div className="min-w-0">

                <p className="px-4 pt-3 text-xs text-slate-500 sm:hidden">

                  Swipe left or right to see every table column.

                </p>

                <div className="w-full max-w-full overflow-x-auto overscroll-x-contain">

                <table className="w-full min-w-[650px] text-left text-sm">

                  <thead className="bg-slate-50 text-slate-600">

                    <tr>

                      <th className="px-6 py-4">

                        LGA

                      </th>

                      <th className="px-6 py-4">

                        Polling Units

                      </th>

                      <th className="px-6 py-4">

                        Submitted

                      </th>

                      <th className="px-6 py-4">

                        Coverage

                      </th>

                    </tr>

                  </thead>

                  <tbody className="divide-y divide-slate-100">

                    {sortedLgaData.map((lga) => (

                      <tr key={lga.lga}>

                        <td className="px-6 py-4 font-medium text-slate-900">

                          {lga.lga}

                        </td>

                        <td className="px-6 py-4">

                          {formatNumber(

                            lga.total_polling_units

                          )}

                        </td>

                        <td className="px-6 py-4">

                          {formatNumber(

                            lga.submitted_polling_units

                          )}

                        </td>

                        <td className="px-6 py-4">

                          <div className="flex items-center gap-3">

                            <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100">

                              <div

                                className="h-full bg-emerald-500"

                                style={{

                                  width: `${

                                    lga.coverage_percent ?? 0

                                  }%`,

                                }}

                              />

                            </div>

                            <span className="font-semibold">

                              {formatPercent(

                                lga.coverage_percent

                              )}

                            </span>

                          </div>

                        </td>

                      </tr>

                    ))}

                  </tbody>

                </table>

                </div>

              </div>

            )}

          </section>

        </>

      )}

    </div>

  );

}
