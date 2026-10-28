import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";

const API_URL =
  import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

// ============================================================
// TYPES
// ============================================================

type Ward = {
  id: number;
  state: string;
  lga: string;
  ward_number: number;
  name: string;
  polling_unit_count: number;
};

type PollingUnit = {
  id: number;
  code: string;
  name: string;
};

type WardDetail = Ward & {
  polling_units: PollingUnit[];
};

type Summary = {
  total_lgas: number;
  registered_lgas: number;
  total_wards: number;
  total_polling_units: number;
};

type WardPage = {
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  wards: Ward[];
};

type LgaResponse = {
  lgas: string[];
};

// ============================================================
// API ERROR HANDLING
// ============================================================

async function parseApiError(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();

    if (typeof body === "object" && body !== null && "detail" in body) {
      const detail = body.detail;

      if (typeof detail === "string") {
        return detail;
      }
    }
  } catch {
    // Fall back to the HTTP status.
  }

  return `Request failed (${response.status}).`;
}

// ============================================================
// WARD MANAGEMENT
// ============================================================

export default function WardManagement() {
  const { token, isLoading } = useAuth();

  // ----------------------------------------------------------
  // STATE
  // ----------------------------------------------------------

  const [lgas, setLgas] = useState<string[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);

  const [selectedLga, setSelectedLga] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const [page, setPage] = useState(1);
  const [pageData, setPageData] = useState<WardPage | null>(null);

  const [selectedWard, setSelectedWard] =
    useState<WardDetail | null>(null);

  const [loading, setLoading] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);

  const [error, setError] = useState("");
  const [detailsError, setDetailsError] = useState("");

  // ----------------------------------------------------------
  // SEARCH DEBOUNCE
  // ----------------------------------------------------------

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, 300);

    return () => window.clearTimeout(timeout);
  }, [search]);

  // ----------------------------------------------------------
  // RESET PAGE WHEN FILTERS CHANGE
  // ----------------------------------------------------------

  useEffect(() => {
    setPage(1);
  }, [selectedLga, debouncedSearch]);

  // ----------------------------------------------------------
  // LOAD LGAS AND SUMMARY
  // ----------------------------------------------------------

  useEffect(() => {
    if (isLoading || !token) {
      return;
    }

    const controller = new AbortController();

    async function loadOverview() {
      try {
        const headers = {
          Authorization: `Bearer ${token}`,
        };

        const [lgasResponse, summaryResponse] = await Promise.all([
          fetch(`${API_URL}/api/wards/lgas`, {
            headers,
            signal: controller.signal,
          }),

          fetch(`${API_URL}/api/wards/summary`, {
            headers,
            signal: controller.signal,
          }),
        ]);

        if (!lgasResponse.ok) {
          throw new Error(await parseApiError(lgasResponse));
        }

        if (!summaryResponse.ok) {
          throw new Error(await parseApiError(summaryResponse));
        }

        const lgaData =
          (await lgasResponse.json()) as LgaResponse;

        const summaryData =
          (await summaryResponse.json()) as Summary;

        if (!controller.signal.aborted) {
          setLgas(lgaData.lgas);
          setSummary(summaryData);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(
            err instanceof Error
              ? err.message
              : "Could not load ward summary."
          );
        }
      }
    }

    void loadOverview();

    return () => controller.abort();
  }, [isLoading, token]);

  // ----------------------------------------------------------
  // LOAD WARDS
  // ----------------------------------------------------------

  useEffect(() => {
    if (isLoading || !token) {
      return;
    }

    const controller = new AbortController();

    async function loadWards() {
      setLoading(true);
      setError("");

      const params = new URLSearchParams({
        page: String(page),
        page_size: "25",
      });

      if (selectedLga) {
        params.set("lga", selectedLga);
      }

      if (debouncedSearch) {
        params.set("search", debouncedSearch);
      }

      try {
        const response = await fetch(
          `${API_URL}/api/wards/all?${params.toString()}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
            signal: controller.signal,
          }
        );

        if (!response.ok) {
          throw new Error(await parseApiError(response));
        }

        const data = (await response.json()) as WardPage;

        if (!controller.signal.aborted) {
          setPageData(data);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(
            err instanceof Error
              ? err.message
              : "Unable to load wards."
          );

          setPageData(null);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadWards();

    return () => controller.abort();
  }, [
    page,
    selectedLga,
    debouncedSearch,
    token,
    isLoading,
  ]);

  // ----------------------------------------------------------
  // VIEW WARD DETAILS
  // ----------------------------------------------------------

  async function openWard(wardId: number) {
    setSelectedWard(null);
    setDetailsError("");
    setDetailsLoading(true);

    try {
      const response = await fetch(
        `${API_URL}/api/wards/details/${wardId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error(await parseApiError(response));
      }

      const data = (await response.json()) as WardDetail;

      setSelectedWard(data);
    } catch (err) {
      setDetailsError(
        err instanceof Error
          ? err.message
          : "Unable to load polling units."
      );
    } finally {
      setDetailsLoading(false);
    }
  }

  // ----------------------------------------------------------
  // DASHBOARD STATISTICS
  // ----------------------------------------------------------

  const stats = [
    {
      label: "Rivers State LGAs",
      value: summary?.total_lgas ?? "—",
    },
    {
      label: "LGAs With Wards",
      value: summary?.registered_lgas ?? "—",
    },
    {
      label: "Registered Wards",
      value: summary?.total_wards ?? "—",
    },
    {
      label: "Polling Units",
      value: summary?.total_polling_units ?? "—",
    },
  ];

  // ============================================================
  // PAGE
  // ============================================================

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">

        {/* HEADER */}

        <header>
          <h1 className="text-3xl font-bold text-slate-900">
            Ward Management
          </h1>

          <p className="mt-2 text-slate-600">
            Browse electoral wards and polling units across
            Rivers State. New records are added through Bulk Import.
          </p>
        </header>

        {/* STATISTICS */}

        <section
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
          aria-label="Ward statistics"
        >
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <p className="text-sm text-slate-500">
                {stat.label}
              </p>

              <p className="mt-2 text-3xl font-bold text-slate-900">
                {stat.value}
              </p>
            </div>
          ))}
        </section>

        {/* FILTERS */}

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid gap-4 md:grid-cols-2">

            {/* LGA FILTER */}

            <label className="block text-sm font-medium text-slate-700">
              Local Government Area

              <select
                value={selectedLga}
                onChange={(event) => {
                  setSelectedLga(event.target.value);
                  setSelectedWard(null);
                  setDetailsError("");
                }}
                className="mt-2 w-full rounded-lg border border-slate-300 bg-white p-3"
              >
                <option value="">All LGAs</option>

                {lgas.map((lga) => (
                  <option key={lga} value={lga}>
                    {lga}
                  </option>
                ))}
              </select>
            </label>

            {/* SEARCH */}

            <label className="block text-sm font-medium text-slate-700">
              Search by Ward Name, Number, or LGA

              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="e.g. ABUA I or 3"
                className="mt-2 w-full rounded-lg border border-slate-300 p-3"
              />
            </label>

          </div>
        </section>

        {/* ERRORS */}

        {error && (
          <div
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700"
          >
            {error}
          </div>
        )}

        {!token && !isLoading && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-800">
            Please sign in to view ward records.
          </div>
        )}

        {/* WARD DIRECTORY */}

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">

          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-5">
            <h2 className="text-xl font-semibold text-slate-900">
              Ward Directory
            </h2>

            <span className="text-sm text-slate-500">
              {pageData?.total ?? 0} matching wards
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">

              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="p-4">Ward No.</th>
                  <th className="p-4">Ward Name</th>
                  <th className="p-4">LGA</th>
                  <th className="p-4">Polling Units</th>
                  <th className="p-4">Action</th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="p-8 text-center text-slate-500"
                    >
                      Loading wards...
                    </td>
                  </tr>
                ) : (pageData?.wards.length ?? 0) === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="p-8 text-center text-slate-500"
                    >
                      No wards found. Check your filters or
                      complete Bulk Import.
                    </td>
                  </tr>
                ) : (
                  pageData?.wards.map((ward) => (
                    <tr
                      key={ward.id}
                      className="border-t border-slate-100 hover:bg-slate-50"
                    >
                      <td className="p-4">
                        {ward.ward_number}
                      </td>

                      <td className="p-4 font-medium text-slate-900">
                        {ward.name}
                      </td>

                      <td className="p-4">
                        {ward.lga}
                      </td>

                      <td className="p-4">
                        {ward.polling_unit_count}
                      </td>

                      <td className="p-4">
                        <button
                          type="button"
                          onClick={() => void openWard(ward.id)}
                          className="rounded-lg bg-emerald-700 px-3 py-2 font-medium text-white hover:bg-emerald-800"
                        >
                          View Polling Units
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>

            </table>
          </div>

          {/* PAGINATION */}

          <div className="flex items-center justify-between gap-3 border-t border-slate-200 p-4">

            <button
              type="button"
              onClick={() =>
                setPage((current) => Math.max(1, current - 1))
              }
              disabled={page <= 1 || loading}
              className="rounded-lg border border-slate-300 px-4 py-2 disabled:opacity-40"
            >
              Previous
            </button>

            <span className="text-sm text-slate-600">
              Page {page} of{" "}
              {Math.max(1, pageData?.total_pages ?? 1)}
            </span>

            <button
              type="button"
              onClick={() =>
                setPage((current) => current + 1)
              }
              disabled={
                loading ||
                page >= (pageData?.total_pages ?? 1)
              }
              className="rounded-lg border border-slate-300 px-4 py-2 disabled:opacity-40"
            >
              Next
            </button>

          </div>
        </section>

        {/* WARD DETAILS */}

        {(detailsLoading || selectedWard || detailsError) && (
          <section
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
            aria-label="Ward details"
          >
            <div className="flex items-start justify-between gap-4">

              <h2 className="text-xl font-semibold text-slate-900">
                Ward Details
              </h2>

              <button
                type="button"
                onClick={() => {
                  setSelectedWard(null);
                  setDetailsError("");
                }}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
              >
                Close
              </button>

            </div>

            {detailsLoading && (
              <p className="mt-4 text-slate-500">
                Loading polling units...
              </p>
            )}

            {detailsError && (
              <p
                role="alert"
                className="mt-4 text-red-700"
              >
                {detailsError}
              </p>
            )}

            {selectedWard && (
              <>
                <p className="mt-3 text-slate-600">
                  <strong>{selectedWard.name}</strong>
                  {" · "}
                  Ward {selectedWard.ward_number}
                  {" · "}
                  {selectedWard.lga}
                  {" · "}
                  {selectedWard.polling_unit_count} polling units
                </p>

                <div className="mt-4 max-h-96 overflow-auto rounded-lg border border-slate-200">
                  <table className="min-w-full text-left text-sm">

                    <thead className="sticky top-0 bg-slate-50">
                      <tr>
                        <th className="p-3">
                          Polling Unit Code
                        </th>
                        <th className="p-3">
                          Polling Unit Name
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {selectedWard.polling_units.length === 0 ? (
                        <tr>
                          <td
                            colSpan={2}
                            className="p-4 text-slate-500"
                          >
                            No polling units linked to this ward.
                          </td>
                        </tr>
                      ) : (
                        selectedWard.polling_units.map((unit) => (
                          <tr
                            key={unit.id}
                            className="border-t border-slate-100"
                          >
                            <td className="p-3 font-mono">
                              {unit.code}
                            </td>

                            <td className="p-3">
                              {unit.name}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>

                  </table>
                </div>
              </>
            )}

          </section>
        )}

      </div>
    </div>
  );
}