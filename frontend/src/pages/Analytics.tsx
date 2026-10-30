import { useEffect, useState } from "react";
import {
  BarChart3,
  Database,
  MapPin,
  RefreshCw,
  ShieldCheck,
  Activity,
  AlertCircle,
} from "lucide-react";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { useAuth } from "../context/AuthContext";

interface DashboardStats {
  total_polling_units: number;
  reported_polling_units: number | null;
  verified_results: number | null;
  pending_verification: number | null;
  data_type: string;
  message: string;
}

interface DashboardStatisticsResponse {
  total_polling_units: number;
  submitted_polling_units: number;
  verification_summary?: Record<string, number>;
  data_type: string;
  message?: string;
}

interface PollingUnit {
  id: number;
  state: string;
  lga: string;
  ward: string;
  name: string;
}

const API_BASE_URL = (
  import.meta.env.VITE_API_URL || "http://127.0.0.1:8000"
).replace(/\/$/, "");

export default function Analytics() {
  const { token } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [pollingUnits, setPollingUnits] = useState<PollingUnit[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function fetchAnalytics() {
      try {
        setLoading(true);
        setError(null);

        const headers: HeadersInit = token
          ? { Authorization: `Bearer ${token}` }
          : {};

        const [dashboardResponse, pollingResponse] =
          await Promise.all([
            fetch(`${API_BASE_URL}/api/dashboard/statistics`, {
              signal: controller.signal,
              headers,
            }),

            fetch(`${API_BASE_URL}/api/polling-units/`, {
              signal: controller.signal,
              headers,
            }),
          ]);

        if (!dashboardResponse.ok) {
          throw new Error("Unable to retrieve dashboard statistics");
        }

        if (!pollingResponse.ok) {
          throw new Error(
            `Unable to retrieve polling units (${pollingResponse.status})`
          );
        }

        const dashboardResponseData: DashboardStatisticsResponse =
          await dashboardResponse.json();

        const verification =
          dashboardResponseData.verification_summary ?? {};
        const dashboardData: DashboardStats = {
          total_polling_units:
            dashboardResponseData.total_polling_units,
          reported_polling_units:
            dashboardResponseData.submitted_polling_units,
          verified_results: verification.verified ?? 0,
          pending_verification:
            (verification.submitted ?? 0) +
            (verification.under_review ?? 0),
          data_type: dashboardResponseData.data_type,
          message:
            dashboardResponseData.message ??
            "Live election monitoring statistics",
        };

        const pollingData: PollingUnit[] =
          await pollingResponse.json();

        if (!Array.isArray(pollingData)) {
          throw new Error("Unexpected polling-unit response");
        }

        if (!controller.signal.aborted) {
          setStats(dashboardData);
          setPollingUnits(pollingData);
        }
      } catch (err) {
        if (controller.signal.aborted) return;

        console.error("Analytics error:", err);

        setError(
          err instanceof Error
            ? err.message
            : "Unable to load analytics"
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    fetchAnalytics();

    return () => controller.abort();
  }, [refreshKey, token]);

  const lgaCounts = pollingUnits.reduce<Record<string, number>>(
    (acc, unit) => {
      const lga = unit.lga || "Unknown";

      acc[lga] = (acc[lga] || 0) + 1;

      return acc;
    },
    {}
  );

  const lgaChartData = Object.entries(lgaCounts)
    .map(([lga, count]) => ({
      lga,
      count,
    }))
    .sort((a, b) => b.count - a.count);

  const totalPollingUnits = stats?.total_polling_units ?? null;

  const formatNumber = (value: number | null) =>
    value === null ? "—" : value.toLocaleString();

  return (
    <div className="w-full min-w-0 space-y-8">

      {/* PAGE HEADER */}

      <section className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-emerald-600">
            ELECTION INTELLIGENCE
          </p>

          <h1 className="mt-2 text-3xl font-bold text-slate-900">
            Analytics Overview
          </h1>

          <p className="mt-2 text-sm text-slate-500">
            Explore available election-monitoring and polling-unit data.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setRefreshKey((value) => value + 1)}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw
            size={17}
            className={loading ? "animate-spin" : ""}
          />
          Refresh Analytics
        </button>
      </section>

      {/* ANALYTICS BANNER */}

      <section className="rounded-2xl bg-slate-950 p-7 text-white">
        <div className="flex items-center gap-3">
          <BarChart3 size={30} className="text-emerald-400" />

          <div>
            <h2 className="text-xl font-bold">
              Dumo Analytics Center
            </h2>

            <p className="mt-1 text-sm text-slate-300">
              Data-driven election monitoring and reporting.
            </p>
          </div>
        </div>
      </section>

      {/* ERROR */}

      {error && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700"
        >
          <AlertCircle size={20} className="shrink-0" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      {/* STATISTICS */}

      <section className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">

        <StatCard
          title="Total Polling Units"
          value={loading || error ? "—" : formatNumber(totalPollingUnits)}
          subtitle="Database-wide count"
          icon={MapPin}
        />

        <StatCard
          title="Submitted Results"
          value={loading || error ? "—" : formatNumber(stats?.reported_polling_units ?? null)}
          subtitle="Polling units reporting for the selected election"
          icon={Activity}
        />

        <StatCard
          title="Pending Verification"
          value={loading || error ? "—" : formatNumber(stats?.pending_verification ?? null)}
          subtitle="Submitted or currently under review"
          icon={Database}
        />

        <StatCard
          title="Verified Results"
          value={
            loading || error
              ? "—"
              : formatNumber(stats?.verified_results ?? null)
          }
          subtitle="Approved through the review workflow"
          icon={ShieldCheck}
        />

      </section>

      {/* CHART */}

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">

        <div className="mb-6">
          <h2 className="text-lg font-bold text-slate-900">
            Polling Units by LGA
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            Rivers State polling-unit distribution across LGAs.
          </p>
        </div>

        {loading ? (
          <div className="flex h-80 items-center justify-center text-slate-500">
            Loading chart...
          </div>
        ) : error ? (
          <div className="flex h-80 items-center justify-center text-slate-500">
            Chart unavailable
          </div>
        ) : lgaChartData.length === 0 ? (
          <div className="flex h-80 items-center justify-center text-slate-500">
            No polling-unit data available.
          </div>
        ) : (
          <div className="h-80 w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={lgaChartData}
                margin={{ top: 10, right: 15, left: 0, bottom: 10 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                />

                <XAxis
                  dataKey="lga"
                  tick={{ fontSize: 11 }}
                  interval={0}
                  angle={-25}
                  textAnchor="end"
                  height={75}
                />

                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 12 }}
                />

                <Tooltip />

                <Bar
                  dataKey="count"
                  name="Polling Units"
                  fill="#10b981"
                  radius={[6, 6, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

      </section>

      {/* DATA AVAILABILITY */}

      <section className="rounded-2xl border border-blue-200 bg-blue-50 p-6">
        <h3 className="font-bold text-blue-900">
          Analytics Data Availability
        </h3>

        <p className="mt-2 text-sm leading-6 text-blue-800">
          {stats?.message ||
            "Analytics are currently based on available polling-unit records."}
        </p>

        <p className="mt-3 text-sm leading-6 text-blue-700">
          Polling-unit distribution comes from the Rivers State register.
          Submission and verification figures come from the current election
          monitoring workflow and update as agents report and administrators
          complete reviews.
        </p>
      </section>

    </div>
  );
}

// ======================================
// REUSABLE STATISTICS CARD
// ======================================

type StatCardProps = {
  title: string;
  value: string;
  subtitle: string;
  icon: typeof MapPin;
};

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
}: StatCardProps) {
  return (
    <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="rounded-xl bg-emerald-50 p-3 text-emerald-600">
          <Icon size={22} />
        </div>
      </div>

      <p className="mt-5 text-sm font-medium text-slate-500">
        {title}
      </p>

      <h3 className="mt-2 text-3xl font-bold text-slate-900">
        {value}
      </h3>

      <p className="mt-2 text-xs text-slate-400">
        {subtitle}
      </p>
    </div>
  );
}
