import { useEffect, useState } from "react";
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

type PollingUnitForm = {
  code: string;
  name: string;
  state: string;
  lga: string;
  ward: string;
};

const emptyForm: PollingUnitForm = {
  code: "",
  name: "",
  state: "Rivers",
  lga: "",
  ward: "",
};

// ============================================================
// API ERROR HANDLING
// ============================================================

async function getApiError(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();

    if (
      typeof body === "object" &&
      body !== null &&
      "detail" in body
    ) {
      const detail = body.detail;

      if (typeof detail === "string") {
        return detail;
      }

      if (Array.isArray(detail)) {
        return detail
          .map((item: unknown) => {
            if (
              typeof item === "object" &&
              item !== null &&
              "msg" in item
            ) {
              return String(item.msg);
            }

            return String(item);
          })
          .join("; ");
      }
    }
  } catch {
    // Use HTTP status.
  }

  return `Request failed (${response.status})`;
}

// ============================================================
// COMPONENT
// ============================================================

export default function PollingUnits() {
  const { token, user, isLoading } = useAuth();

  const isAdmin = user?.role === "admin";

  // Overview
  const [summary, setSummary] = useState<Summary | null>(null);

  // Filters
  const [lgas, setLgas] = useState<string[]>([]);
  const [wards, setWards] = useState<string[]>([]);

  const [selectedLga, setSelectedLga] = useState("");
  const [selectedWard, setSelectedWard] = useState("");

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Directory
  const [page, setPage] = useState(1);

  const [directory, setDirectory] =
    useState<DirectoryResponse | null>(null);

  const [loading, setLoading] = useState(false);

  // Form
  const [form, setForm] = useState<PollingUnitForm>(emptyForm);
  const [formWards, setFormWards] = useState<string[]>([]);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  // Messages
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Refresh after create/update
  const [refreshKey, setRefreshKey] = useState(0);

  // ==========================================================
  // SEARCH DEBOUNCE
  // ==========================================================

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, 300);

    return () => window.clearTimeout(timer);
  }, [search]);

  // ==========================================================
  // RESET PAGINATION
  // ==========================================================

  useEffect(() => {
    setPage(1);
  }, [selectedLga, selectedWard, debouncedSearch]);

  // ==========================================================
  // LOAD SUMMARY AND LGAS
  // ==========================================================

  useEffect(() => {
    if (isLoading || !token) return;

    const controller = new AbortController();

    async function loadOverview() {
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
          throw new Error(await getApiError(summaryResponse));
        }

        if (!lgaResponse.ok) {
          throw new Error(await getApiError(lgaResponse));
        }

        const summaryData =
          (await summaryResponse.json()) as Summary;

        const lgaData =
          (await lgaResponse.json()) as LgaResponse;

        if (!controller.signal.aborted) {
          setSummary(summaryData);
          setLgas(lgaData.lgas);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(
            err instanceof Error
              ? err.message
              : "Failed to load overview."
          );
        }
      }
    }

    void loadOverview();

    return () => controller.abort();
  }, [token, isLoading, refreshKey]);

  // ==========================================================
  // LOAD FILTER WARDS
  // ==========================================================

  useEffect(() => {
    setWards([]);

    if (!token || !selectedLga) return;

    const controller = new AbortController();

    async function loadWards() {
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
          throw new Error(await getApiError(response));
        }

        const data = (await response.json()) as WardResponse;

        if (!controller.signal.aborted) {
          setWards(data.wards);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(
            err instanceof Error
              ? err.message
              : "Failed to load wards."
          );
        }
      }
    }

    void loadWards();

    return () => controller.abort();
  }, [selectedLga, token, refreshKey]);

  // ==========================================================
  // LOAD FORM WARDS
  // ==========================================================

  useEffect(() => {
    setFormWards([]);

    if (!token || !form.lga) return;

    const controller = new AbortController();

    async function loadFormWards() {
      try {
        const response = await fetch(
          `${API_URL}/api/polling-units/wards?lga=${encodeURIComponent(
            form.lga
          )}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
            signal: controller.signal,
          }
        );

        if (!response.ok) {
          throw new Error(await getApiError(response));
        }

        const data = (await response.json()) as WardResponse;

        if (!controller.signal.aborted) {
          setFormWards(data.wards);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(
            err instanceof Error
              ? err.message
              : "Failed to load form wards."
          );
        }
      }
    }

    void loadFormWards();

    return () => controller.abort();
  }, [form.lga, token, refreshKey]);

  // ==========================================================
  // LOAD POLLING UNIT DIRECTORY
  // ==========================================================

  useEffect(() => {
    if (isLoading || !token) return;

    const controller = new AbortController();

    async function loadDirectory() {
      setLoading(true);
      setError("");

      const params = new URLSearchParams({
        page: String(page),
        page_size: "25",
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
          throw new Error(await getApiError(response));
        }

        const data =
          (await response.json()) as DirectoryResponse;

        if (!controller.signal.aborted) {
          setDirectory(data);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(
            err instanceof Error
              ? err.message
              : "Failed to load polling units."
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
    page,
    selectedLga,
    selectedWard,
    debouncedSearch,
    refreshKey,
  ]);

  // ==========================================================
  // FORM HELPERS
  // ==========================================================

  function updateForm(
    field: keyof PollingUnitForm,
    value: string
  ) {
    setForm((current) => ({
      ...current,
      [field]: value,
      ...(field === "lga" ? { ward: "" } : {}),
    }));
  }

  function resetForm() {
    setForm(emptyForm);
    setEditingId(null);
    setError("");
  }

  function startEditing(unit: PollingUnit) {
    setEditingId(unit.id);

    setForm({
      code: unit.code,
      name: unit.name,
      state: unit.state,
      lga: unit.lga,
      ward: unit.ward,
    });

    setError("");
    setSuccess("");

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  // ==========================================================
  // CREATE OR UPDATE POLLING UNIT
  // ==========================================================

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (!token || !isAdmin) return;

    setSaving(true);
    setError("");
    setSuccess("");

    const payload = {
      code: form.code.trim(),
      name: form.name.trim(),
      state: "Rivers",
      lga: form.lga,
      ward: form.ward,
    };

    const isEditing = editingId !== null;

    const endpoint = isEditing
      ? `${API_URL}/api/polling-units/${editingId}`
      : `${API_URL}/api/polling-units/`;

    try {
      const response = await fetch(endpoint, {
        method: isEditing ? "PATCH" : "POST",

        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },

        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(await getApiError(response));
      }

      setSuccess(
        isEditing
          ? "Polling unit updated successfully."
          : "Polling unit registered successfully."
      );

      setForm(emptyForm);
      setEditingId(null);

      setRefreshKey((current) => current + 1);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to save polling unit."
      );
    } finally {
      setSaving(false);
    }
  }

  // ==========================================================
  // DASHBOARD STATISTICS
  // ==========================================================

  const stats = [
    {
      label: "Total Polling Units",
      value: summary?.total_polling_units ?? "—",
    },
    {
      label: "LGAs With Polling Units",
      value: summary?.total_lgas ?? "—",
    },
    {
      label: "Wards With Polling Units",
      value: summary?.total_wards ?? "—",
    },
    {
      label: "Matching Records",
      value: directory?.total ?? "—",
    },
  ];

  // ==========================================================
  // PAGE
  // ==========================================================

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">

        {/* PAGE HEADER */}

        <header>
          <h1 className="text-3xl font-bold text-slate-900">
            Polling Unit Management
          </h1>

          <p className="mt-2 text-slate-600">
            Manage polling units across Rivers State.
            Search, filter, register and update polling-unit records.
          </p>

          {user && (
            <p className="mt-2 text-sm text-slate-500">
              Logged in as: {user.full_name} ({user.role})
            </p>
          )}
        </header>

        {/* STATISTICS */}

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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

        {/* ERROR MESSAGE */}

        {error && (
          <div
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700"
          >
            {error}
          </div>
        )}

        {/* SUCCESS MESSAGE */}

        {success && (
          <div
            role="status"
            className="rounded-lg border border-green-200 bg-green-50 p-4 text-green-700"
          >
            {success}
          </div>
        )}

        {/* FILTERS */}

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-xl font-semibold text-slate-900">
            Filter Polling Units
          </h2>

          <div className="grid gap-4 md:grid-cols-3">

            {/* LGA FILTER */}

            <label className="text-sm font-medium text-slate-700">
              Local Government Area

              <select
                value={selectedLga}
                onChange={(event) => {
                  setSelectedLga(event.target.value);
                  setSelectedWard("");
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

            {/* WARD FILTER */}

            <label className="text-sm font-medium text-slate-700">
              Ward

              <select
                value={selectedWard}
                onChange={(event) =>
                  setSelectedWard(event.target.value)
                }
                disabled={!selectedLga}
                className="mt-2 w-full rounded-lg border border-slate-300 bg-white p-3 disabled:bg-slate-100"
              >
                <option value="">All Wards</option>

                {wards.map((ward) => (
                  <option key={ward} value={ward}>
                    {ward}
                  </option>
                ))}
              </select>
            </label>

            {/* SEARCH */}

            <label className="text-sm font-medium text-slate-700">
              Search Polling Units

              <input
                type="text"
                value={search}
                onChange={(event) =>
                  setSearch(event.target.value)
                }
                placeholder="Enter name, code, LGA or ward"
                className="mt-2 w-full rounded-lg border border-slate-300 p-3"
              />
            </label>

          </div>
        </section>

        {/* ADMIN FORM */}

        {isAdmin && (
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">
                  {editingId !== null
                    ? "Edit Polling Unit"
                    : "Register New Polling Unit"}
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  Use verified electoral-register information.
                </p>
              </div>

              {editingId !== null && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="rounded-lg border border-slate-300 px-4 py-2"
                >
                  Cancel Editing
                </button>
              )}
            </div>

            <form
              onSubmit={handleSubmit}
              className="grid gap-4 md:grid-cols-2"
            >

              {/* CODE */}

              <label className="text-sm font-medium">
                Polling Unit Code

                <input
                  required
                  value={form.code}
                  onChange={(event) =>
                    updateForm("code", event.target.value)
                  }
                  placeholder="32/01/01/001"
                  className="mt-2 w-full rounded-lg border border-slate-300 p-3"
                />
              </label>

              {/* NAME */}

              <label className="text-sm font-medium">
                Polling Unit Name

                <input
                  required
                  value={form.name}
                  onChange={(event) =>
                    updateForm("name", event.target.value)
                  }
                  placeholder="Enter polling unit name"
                  className="mt-2 w-full rounded-lg border border-slate-300 p-3"
                />
              </label>

              {/* STATE */}

              <label className="text-sm font-medium">
                State

                <input
                  value="Rivers"
                  readOnly
                  className="mt-2 w-full rounded-lg border border-slate-300 bg-slate-100 p-3"
                />
              </label>

              {/* LGA */}

              <label className="text-sm font-medium">
                Local Government Area

                <select
                  required
                  value={form.lga}
                  onChange={(event) =>
                    updateForm("lga", event.target.value)
                  }
                  className="mt-2 w-full rounded-lg border border-slate-300 p-3"
                >
                  <option value="">Select LGA</option>

                  {lgas.map((lga) => (
                    <option key={lga} value={lga}>
                      {lga}
                    </option>
                  ))}
                </select>
              </label>

              {/* WARD */}

              <label className="text-sm font-medium md:col-span-2">
                Ward

                <select
                  required
                  value={form.ward}
                  onChange={(event) =>
                    updateForm("ward", event.target.value)
                  }
                  disabled={!form.lga}
                  className="mt-2 w-full rounded-lg border border-slate-300 p-3 disabled:bg-slate-100"
                >
                  <option value="">Select Ward</option>

                  {formWards.map((ward) => (
                    <option key={ward} value={ward}>
                      {ward}
                    </option>
                  ))}
                </select>
              </label>

              {/* SUBMIT */}

              <div className="md:col-span-2 flex flex-wrap gap-3">
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-emerald-700 px-6 py-3 font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
                >
                  {saving
                    ? "Saving..."
                    : editingId !== null
                    ? "Update Polling Unit"
                    : "Register Polling Unit"}
                </button>

                {editingId !== null && (
                  <button
                    type="button"
                    onClick={resetForm}
                    className="rounded-lg border border-slate-300 px-6 py-3"
                  >
                    Cancel
                  </button>
                )}
              </div>

            </form>
          </section>
        )}

        {/* POLLING UNIT DIRECTORY */}

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">

          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-5">
            <h2 className="text-xl font-semibold text-slate-900">
              Polling Unit Directory
            </h2>

            <span className="text-sm text-slate-500">
              {directory?.total ?? 0} matching records
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">

              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="p-4">Code</th>
                  <th className="p-4">Polling Unit Name</th>
                  <th className="p-4">State</th>
                  <th className="p-4">LGA</th>
                  <th className="p-4">Ward</th>

                  {isAdmin && (
                    <th className="p-4">Action</th>
                  )}
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <tr>
                    <td
                      colSpan={isAdmin ? 6 : 5}
                      className="p-8 text-center text-slate-500"
                    >
                      Loading polling units...
                    </td>
                  </tr>
                ) : (directory?.polling_units.length ?? 0) === 0 ? (
                  <tr>
                    <td
                      colSpan={isAdmin ? 6 : 5}
                      className="p-8 text-center text-slate-500"
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
                      <td className="p-4 font-mono">
                        {unit.code}
                      </td>

                      <td className="p-4 font-medium text-slate-900">
                        {unit.name}
                      </td>

                      <td className="p-4">
                        {unit.state}
                      </td>

                      <td className="p-4">
                        {unit.lga}
                      </td>

                      <td className="p-4">
                        {unit.ward}
                      </td>

                      {isAdmin && (
                        <td className="p-4">
                          <button
                            type="button"
                            onClick={() => startEditing(unit)}
                            className="rounded-lg bg-blue-700 px-4 py-2 text-white hover:bg-blue-800"
                          >
                            Edit
                          </button>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>

            </table>
          </div>

          {/* PAGINATION */}

          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-200 p-4">

            <button
              type="button"
              onClick={() =>
                setPage((current) =>
                  Math.max(1, current - 1)
                )
              }
              disabled={page <= 1 || loading}
              className="rounded-lg border border-slate-300 px-4 py-2 disabled:opacity-40"
            >
              Previous
            </button>

            <span className="text-sm text-slate-600">
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
              className="rounded-lg border border-slate-300 px-4 py-2 disabled:opacity-40"
            >
              Next
            </button>

          </div>
        </section>

      </div>
    </div>
  );
}