import { useCallback, useEffect, useState } from "react";

import {

  Activity,

  AlertCircle,

  BarChart3,

  CalendarDays,

  CheckCircle2,

  ClipboardList,

  MapPin,

  RefreshCw,

  Users,

  Vote,

} from "lucide-react";

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
import EnableNotifications from "../components/EnableNotifications";

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

type DashboardStatistics = {

  state: string;

  data_type: string;

  election: Election | null;

  total_polling_units: number;

  assigned_polling_units: number;

  submitted_polling_units: number;

  submission_coverage_percent: number | null;

  accredited_voters: number | null;

  valid_votes: number | null;

  rejected_votes: number | null;

  party_totals: PartyTotal[];

  lga_progress: LgaProgress[];

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

    <div className="min-w-0 w-full rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">

      <div className="flex min-w-0 items-start justify-between gap-3">

        <div className="min-w-0 flex-1">

          <p className="whitespace-normal break-words text-sm font-medium leading-relaxed text-slate-500">

            {title}

          </p>

          <p className="mt-3 break-words text-2xl font-bold leading-tight text-slate-900 sm:text-3xl">

            {value}

          </p>

        </div>

        <div className="shrink-0 rounded-xl bg-emerald-50 p-3 text-emerald-600">

          <Icon size={22} />

        </div>

      </div>

      <p className="mt-4 whitespace-normal break-words text-xs leading-relaxed text-slate-500">

        {description}

      </p>

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

  // ========================================

  // RENDER

  // ========================================

  return (

    <div className="w-full min-w-0 max-w-full space-y-7 break-words">
      {/* Agent notification preferences */}
      {user?.role === "agent" && <EnableNotifications />}

      {/* =====================================

          HEADER

      ===================================== */}

      <div className="flex min-w-0 flex-wrap items-start justify-between gap-4">

        <div>

          <div className="flex items-center gap-2 text-emerald-600">

            <Activity size={19} />

            <span className="text-xs font-semibold uppercase tracking-widest">

              Rivers State Monitoring

            </span>

          </div>

          <h1 className="mt-2 text-2xl font-bold leading-tight text-slate-900 sm:text-3xl">

            Election Monitoring Dashboard

          </h1>

          <p className="mt-2 text-sm text-slate-500">

            Polling-unit submissions and election monitoring statistics.

          </p>

        </div>

        <button

          type="button"

          onClick={() => loadStatistics(undefined, true)}

          disabled={loading || refreshing}

          className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"

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

      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">

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

          <p className="mt-2 text-xs">

            Confirm that your FastAPI backend is running

            and that /api/dashboard/statistics is available.

          </p>

        </div>

      )}

      {/* =====================================

          LOADING

      ===================================== */}

      {loading && (

        <div

          role="status"

          className="rounded-2xl border border-slate-200 bg-white p-10 text-center"

        >

          <RefreshCw

            size={28}

            className="mx-auto animate-spin text-emerald-600"

          />

          <p className="mt-4 text-sm text-slate-600">

            Loading election monitoring statistics...

          </p>

        </div>

      )}

      {/* =====================================

          DASHBOARD CONTENT

      ===================================== */}

      {!loading && !error && statistics && (

        <>

          {/* ELECTION INFORMATION */}

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">

            <div className="flex flex-wrap items-center justify-between gap-5">

              <div>

                <div className="flex items-center gap-2">

                  <CalendarDays

                    size={19}

                    className="text-emerald-600"

                  />

                  <h2 className="font-semibold text-slate-900">

                    Current Election

                  </h2>

                </div>

                <p className="mt-3 break-words text-lg font-bold text-slate-900 sm:text-xl">

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

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">

            <h2 className="text-lg font-bold text-slate-900">

              Polling-Unit Submission Coverage

            </h2>

            <p className="mt-2 text-sm text-slate-500">

              Percentage of Rivers State polling units with

              agent-submitted results.

            </p>

            <div className="mt-6 h-4 overflow-hidden rounded-full bg-slate-100">

              <div

                className="h-full rounded-full bg-emerald-500 transition-all duration-500"

                style={{

                  width: `${

                    statistics.submission_coverage_percent ?? 0

                  }%`,

                }}

              />

            </div>

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

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">

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

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">

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
