import { useEffect, useState } from "react";

import {
  MapPin,
  RefreshCw,
  Search,
  Building2,
  Layers3,
  ListChecks,
  Eye,
  X,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

import { useAuth } from "../context/AuthContext";

const API_URL =
  import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

// ============================================================
// TYPES
// ============================================================

type PollingUnit = {
  id: number;
  code: string;
  name: string;
  state: string;
  lga: string;
  ward: string;
};

type Summary = {
  total_polling_units: number;
  total_lgas: number;
  total_wards: number;
};

type DirectoryResponse = {
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  polling_units: PollingUnit[];
};

type LgaResponse = {
  lgas: string[];
};

type WardResponse = {
  lga: string;
  wards: string[];
};

// ============================================================
// API ERROR HANDLING
// ============================================================

async function apiError(response: Response): Promise<string> {
  try {
    const body = await response.json();

    if (typeof body.detail === "string") {
      return body.detail;
    }

    if (Array.isArray(body.detail)) {
      return body.detail
        .map((item: { msg?: string }) => item.msg || "Invalid input")
        .join(", ");
    }
  } catch {
    // Fall back to HTTP status.
  }

  return `Request failed (${response.status})`;
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export default function PollingUnitManagement() {
  const { user, token, isLoading } = useAuth();

  const isAdmin = user?.role === "admin";

  // Statistics
  const [summary, setSummary] = useState<Summary | null>(null);

  // LGAs and wards
  const [lgas, setLgas] = useState<string[]>([]);
  const [wards, setWards] = useState<string[]>([]);

  // Filters
  const [selectedLga, setSelectedLga] = useState("");
  const [selectedWard, setSelectedWard] = useState("");

  // Search
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Directory
  const [directory, setDirectory] =
    useState<DirectoryResponse | null>(null);

  // Pagination
  const [page, setPage] = useState(1);
  const pageSize = 25;

  // Loading
  const [loading, setLoading] = useState(false);
  const [loadingOverview, setLoadingOverview] = useState(false);
  const [loadingWards, setLoadingWards] = useState(false);

  // Messages
  const [error, setError] = useState("");

  // Selected polling unit
  const [selectedUnit, setSelectedUnit] =
    useState<PollingUnit | null>(null);

  // Refresh
  const [refreshKey, setRefreshKey] = useState(0);

  // ==========================================================
  // SEARCH DEBOUNCE
  // ==========================================================

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, 350);

    return () => window.clearTimeout(timer);
  }, [search]);

  // ==========================================================
  // LOAD SUMMARY AND LGAS
  // ==========================================================

  useEffect(() => {
    if (isLoading || !token || !isAdmin) return;

    const controller = new AbortController();

    async function loadOverview() {
      setLoadingOverview(true);

      try {
        const headers = {
          Authorization: `Bearer ${token}`,
        };

        const [summaryResponse, lgaResponse] = await Promise.all([
          fetch(`${API_URL}/api/polling-units/summary`, {
            headers,
            signal: controller.signal,
          }),

          fetch(`${API_URL}/api/wards/lgas`, {
            headers,
            signal: controller.signal,
          }),
        ]);

        if (!summaryResponse.ok) {
          throw new Error(await apiError(summaryResponse));
        }

        if (!lgaResponse.ok) {
          throw new Error(await apiError(lgaResponse));
        }

        const summaryData =
          (await summaryResponse.json()) as Summary;

        const lgaData =
          (await lgaResponse.json()) as LgaResponse;

        if (!Array.isArray(lgaData.lgas)) {
          throw new Error("Unexpected LGA response.");
        }

        if (!controller.signal.aborted) {
          setSummary(summaryData);
          setLgas(lgaData.lgas);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(
            err instanceof Error
              ? err.message
              : "Unable to load polling-unit overview."
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoadingOverview(false);
        }
      }
    }

    void loadOverview();

    return () => controller.abort();
  }, [token, isLoading, isAdmin, refreshKey]);

  // ==========================================================
  // LOAD WARDS WHEN LGA CHANGES
  // ==========================================================

  useEffect(() => {
    setWards([]);

    if (!token || !selectedLga || !isAdmin) {
      setLoadingWards(false);
      return;
    }

    const controller = new AbortController();

    async function loadWards() {
      setLoadingWards(true);

      try {
        const response = await fetch(
          `${API_URL}/api/polling-units/wards?lga=${encodeURIComponent(
            selectedLga
          )}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
            signal: controller.signal,
          }
        );

        if (!response.ok) {
          throw new Error(await apiError(response));
        }

        const data = (await response.json()) as WardResponse;

        if (!Array.isArray(data.wards)) {
          throw new Error("Unexpected ward response.");
        }

        if (!controller.signal.aborted) {
          setWards(data.wards);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(
            err instanceof Error
              ? err.message
              : "Unable to load wards."
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoadingWards(false);
        }
      }
    }

    void loadWards();

    return () => controller.abort();
  }, [selectedLga, token, isAdmin, refreshKey]);

  // ==========================================================
  // LOAD POLLING UNIT DIRECTORY
  // ==========================================================

  useEffect(() => {
    if (isLoading || !token || !isAdmin) return;

    const controller = new AbortController();

    async function loadDirectory() {
      setLoading(true);
      setError("");

      const params = new URLSearchParams({
        page: String(page),
        page_size: String(pageSize),
      });

      if (selectedLga) {
        params.set("lga", selectedLga);
      }

      if (selectedWard) {
        params.set("ward", selectedWard);
      }

      if (debouncedSearch) {
        params.set("search", debouncedSearch);
      }

      try {
        const response = await fetch(
          `${API_URL}/api/polling-units/directory?${params.toString()}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
            signal: controller.signal,
          }
        );

        if (!response.ok) {
          throw new Error(await apiError(response));
        }

        const data =
          (await response.json()) as DirectoryResponse;

        if (!Array.isArray(data.polling_units)) {
          throw new Error("Unexpected polling-unit response.");
        }

        if (!controller.signal.aborted) {
          setDirectory(data);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(
            err instanceof Error
              ? err.message
              : "Unable to load polling units."
          );

          setDirectory(null);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadDirectory();

    return () => controller.abort();
  }, [
    token,
    isLoading,
    isAdmin,
    page,
    selectedLga,
    selectedWard,
    debouncedSearch,
    refreshKey,
  ]);

  // ==========================================================
  // FILTER HANDLERS
  // ==========================================================

  function handleLgaChange(value: string) {
    setSelectedLga(value);
    setSelectedWard("");
    setPage(1);
  }

  function handleWardChange(value: string) {
    setSelectedWard(value);
    setPage(1);
  }

  function handleSearchChange(value: string) {
    setSearch(value);
    setPage(1);
  }

  function clearFilters() {
    setSelectedLga("");
    setSelectedWard("");
    setSearch("");
    setDebouncedSearch("");
    setPage(1);
  }

  function refreshData() {
    setError("");
    setRefreshKey((current) => current + 1);
  }

  // ==========================================================
  // STATISTICS
  // ==========================================================

  const statistics = [
    {
      title: "Total Polling Units",
      value: summary?.total_polling_units ?? "—",
      icon: ListChecks,
      color: "text-emerald-700",
      background: "bg-emerald-50",
    },
    {
      title: "LGAs Covered",
      value: summary?.total_lgas ?? "—",
      icon: Building2,
      color: "text-blue-700",
      background: "bg-blue-50",
    },
    {
      title: "Wards Covered",
      value: summary?.total_wards ?? "—",
      icon: Layers3,
      color: "text-purple-700",
      background: "bg-purple-50",
    },
    {
      title: "Matching Records",
      value: directory?.total ?? "—",
      icon: MapPin,
      color: "text-amber-700",
      background: "bg-amber-50",
    },
  ];

  // ==========================================================
  // ACCESS CONTROL
  // ==========================================================

  if (isLoading) {
    return (
      <div className="p-6 text-slate-600">
        Loading account...
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-800">
        Polling Unit Management is available only to administrators.
      </div>
    );
  }

  // ==========================================================
  // PAGE
  // ==========================================================

  return (
    <div className="space-y-6">

      {/* HEADER */}

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Polling Unit Management
          </h1>

          <p className="mt-1 text-sm text-slate-500">
            View and monitor imported polling units across Rivers State.
          </p>
        </div>

        <button
          type="button"
          onClick={refreshData}
          disabled={loading || loadingOverview}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw size={17} />
          Refresh
        </button>
      </div>

      {/* STATISTICS */}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {statistics.map((stat) => {
          const Icon = stat.icon;

          return (
            <div
              key={stat.title}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-slate-500">
                  {stat.title}
                </p>

                <div
                  className={`rounded-xl p-3 ${stat.background}`}
                >
                  <Icon size={21} className={stat.color} />
                </div>
              </div>

              <p className="mt-3 text-3xl font-bold text-slate-900">
                {loadingOverview && summary === null
                  ? "..."
                  : stat.value}
              </p>
            </div>
          );
        })}
      </div>

      {/* ERROR */}

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      {/* FILTERS */}

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            <Search size={20} className="text-emerald-700" />
            Filter Polling Units
          </h2>

          <button
            type="button"
            onClick={clearFilters}
            className="text-sm font-medium text-emerald-700 hover:underline"
          >
            Clear Filters
          </button>
        </div>

        <div className="grid gap-5 md:grid-cols-3">

          {/* LGA */}

          <label className="block text-sm font-medium text-slate-700">
            Local Government Area

            <select
              value={selectedLga}
              onChange={(event) =>
                handleLgaChange(event.target.value)
              }
              className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3"
            >
              <option value="">All LGAs</option>

              {lgas.map((lga) => (
                <option key={lga} value={lga}>
                  {lga}
                </option>
              ))}
            </select>
          </label>

          {/* WARD */}

          <label className="block text-sm font-medium text-slate-700">
            Ward

            <select
              value={selectedWard}
              onChange={(event) =>
                handleWardChange(event.target.value)
              }
              disabled={!selectedLga || loadingWards}
              className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 disabled:bg-slate-100"
            >
              <option value="">
                {!selectedLga
                  ? "Select an LGA first"
                  : loadingWards
                  ? "Loading wards..."
                  : "All Wards"}
              </option>

              {wards.map((ward) => (
                <option key={ward} value={ward}>
                  {ward}
                </option>
              ))}
            </select>
          </label>

          {/* SEARCH */}

          <label className="block text-sm font-medium text-slate-700">
            Search Polling Units

            <input
              type="text"
              value={search}
              onChange={(event) =>
                handleSearchChange(event.target.value)
              }
              placeholder="Search by name or code"
              className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3"
            />
          </label>
        </div>
      </section>

      {/* DIRECTORY */}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">

        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-5">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Polling Unit Directory
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Imported electoral-register records
            </p>
          </div>

          <span className="rounded-full bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700">
            {directory?.total ?? 0} records
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">

            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-5 py-4">Code</th>
                <th className="px-5 py-4">Polling Unit Name</th>
                <th className="px-5 py-4">State</th>
                <th className="px-5 py-4">LGA</th>
                <th className="px-5 py-4">Ward</th>
                <th className="px-5 py-4">Action</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-5 py-10 text-center text-slate-500"
                  >
                    Loading polling units...
                  </td>
                </tr>
              ) : (directory?.polling_units.length ?? 0) === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-5 py-10 text-center text-slate-500"
                  >
                    No polling units found.
                  </td>
                </tr>
              ) : (
                directory?.polling_units.map((unit) => (
                  <tr
                    key={unit.id}
                    className="border-t border-slate-100 hover:bg-slate-50"
                  >
                    <td className="px-5 py-4 font-mono font-medium">
                      {unit.code}
                    </td>

                    <td className="px-5 py-4 font-medium text-slate-900">
                      {unit.name}
                    </td>

                    <td className="px-5 py-4">
                      {unit.state}
                    </td>

                    <td className="px-5 py-4">
                      {unit.lga}
                    </td>

                    <td className="px-5 py-4">
                      {unit.ward}
                    </td>

                    <td className="px-5 py-4">
                      <button
                        type="button"
                        onClick={() => setSelectedUnit(unit)}
                        className="inline-flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 font-medium text-emerald-700 hover:bg-emerald-100"
                      >
                        <Eye size={16} />
                        View
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* PAGINATION */}

        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-200 p-5">

          <p className="text-sm text-slate-500">
            Showing{" "}
            {directory && directory.total > 0
              ? (page - 1) * pageSize + 1
              : 0}
            {" - "}
            {directory
              ? Math.min(page * pageSize, directory.total)
              : 0}
            {" of "}
            {directory?.total ?? 0}
          </p>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() =>
                setPage((current) =>
                  Math.max(1, current - 1)
                )
              }
              disabled={page <= 1 || loading}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 disabled:opacity-40"
            >
              <ChevronLeft size={17} />
              Previous
            </button>

            <span className="text-sm font-medium text-slate-600">
              Page {page} of{" "}
              {Math.max(1, directory?.total_pages ?? 1)}
            </span>

            <button
              type="button"
              onClick={() =>
                setPage((current) => current + 1)
              }
              disabled={
                loading ||
                page >= (directory?.total_pages ?? 1)
              }
              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 disabled:opacity-40"
            >
              Next
              <ChevronRight size={17} />
            </button>
          </div>
        </div>
      </section>

      {/* POLLING UNIT DETAILS MODAL */}

      {selectedUnit && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setSelectedUnit(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="polling-unit-details-title"
            className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-6 flex items-center justify-between">
              <h2
                id="polling-unit-details-title"
                className="text-xl font-bold text-slate-900"
              >
                Polling Unit Details
              </h2>

              <button
                type="button"
                onClick={() => setSelectedUnit(null)}
                aria-label="Close details"
                className="rounded-lg p-2 hover:bg-slate-100"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              {[
                ["Polling Unit Code", selectedUnit.code],
                ["Polling Unit Name", selectedUnit.name],
                ["State", selectedUnit.state],
                ["Local Government Area", selectedUnit.lga],
                ["Ward", selectedUnit.ward],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="border-b border-slate-100 pb-3"
                >
                  <p className="text-xs font-medium uppercase text-slate-500">
                    {label}
                  </p>

                  <p className="mt-1 font-medium text-slate-900">
                    {value}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedUnit(null)}
                className="rounded-xl bg-emerald-700 px-5 py-3 font-medium text-white hover:bg-emerald-800"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}