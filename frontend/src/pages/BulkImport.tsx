import { useState, type ChangeEvent } from "react";
import { useAuth } from "../context/AuthContext";

const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
const MAX_FILE_SIZE = 5 * 1024 * 1024;

type Mode = "wards" | "electoral-register";
type WardRecord = { row: number; state: string; lga: string; ward_number: number; ward_name: string };
type WardError = { row: number; error: string };
type WardPreview = {
  message: string;
  can_import: boolean;
  total_rows: number;
  ready_count: number;
  skipped_count: number;
  error_count: number;
  ready: WardRecord[];
  errors: WardError[];
  by_lga: Record<string, number>;
};
type ElectoralPreview = {
  message?: string;
  valid: boolean;
  can_import?: boolean;
  total_rows: number;
  new_wards: number;
  new_polling_units: number;
  skipped_polling_units: number;
  errors: string[];
};
type WardResult = { message: string; imported: number; already_existing: number; errors: number };
type ElectoralResult = {
  message: string;
  created_wards: number;
  created_polling_units: number;
  skipped_polling_units: number;
  total_rows: number;
};

type Preview = WardPreview | ElectoralPreview;
type Result = WardResult | ElectoralResult;

function isWardPreview(value: Preview): value is WardPreview {
  return "ready_count" in value;
}
function isWardResult(value: Result): value is WardResult {
  return "imported" in value;
}
function describeError(data: unknown, fallback: string): string {
  if (!data || typeof data !== "object") return fallback;
  const detail = (data as { detail?: unknown }).detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map(String).join("; ");
  if (detail && typeof detail === "object") {
    const object = detail as { message?: unknown; errors?: unknown };
    const message = typeof object.message === "string" ? object.message : fallback;
    if (Array.isArray(object.errors) && object.errors.length) {
      return `${message} ${object.errors.slice(0, 5).map((item) =>
        typeof item === "string" ? item : JSON.stringify(item)
      ).join("; ")}`;
    }
    return message;
  }
  return fallback;
}

function StatCard({ title, value }: { title: string; value: number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-medium text-slate-500">{title}</p>
      <p className="mt-2 text-2xl font-bold text-slate-900">{value.toLocaleString()}</p>
    </div>
  );
}

export default function BulkImport() {
  const { token } = useAuth();
  const [mode, setMode] = useState<Mode>("electoral-register");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");

  function reset(nextMode?: Mode) {
    if (nextMode) setMode(nextMode);
    setFile(null);
    setPreview(null);
    setResult(null);
    setError("");
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] || null;
    setFile(selected);
    setPreview(null);
    setResult(null);
    setError("");
    if (selected && (!selected.name.toLowerCase().endsWith(".csv") || selected.size > MAX_FILE_SIZE)) {
      setFile(null);
      setError("Select a CSV file no larger than 5 MB.");
    }
  }

  async function requestImport(path: string): Promise<unknown> {
    if (!file || !token) throw new Error("Select a CSV file and sign in as an administrator.");
    const body = new FormData();
    body.append("file", file);
    const response = await fetch(`${API_URL}/api/admin/import/${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body,
    });
    let data: unknown;
    try {
      data = await response.json();
    } catch {
      throw new Error(`Server returned an invalid response (HTTP ${response.status}).`);
    }
    if (!response.ok) throw new Error(describeError(data, `Request failed (HTTP ${response.status}).`));
    return data;
  }

  async function handlePreview() {
    setLoading(true);
    setError("");
    setPreview(null);
    setResult(null);
    try {
      const data = await requestImport(`${mode}/preview`);
      setPreview(data as Preview);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to preview the CSV.");
    } finally {
      setLoading(false);
    }
  }

  async function handleImport() {
    if (!preview || !file) return;
    const allowed = isWardPreview(preview)
      ? preview.can_import && preview.ready_count > 0
      : preview.valid && preview.new_wards + preview.new_polling_units > 0;
    if (!allowed) return;
    const description = isWardPreview(preview)
      ? `${preview.ready_count} new wards`
      : `${preview.new_wards} new wards and ${preview.new_polling_units} new polling units`;
    if (!window.confirm(`Import ${description} into Dumo Network?`)) return;
    setImporting(true);
    setError("");
    try {
      const data = await requestImport(mode);
      setResult(data as Result);
      setPreview(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setImporting(false);
    }
  }

  const busy = loading || importing;
  const canImport = preview && (isWardPreview(preview)
    ? preview.can_import && preview.ready_count > 0
    : preview.valid && preview.new_wards + preview.new_polling_units > 0);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-bold text-slate-900">Bulk Data Import</h1>
        <p className="mt-2 text-sm text-slate-500">Preview and validate electoral records before saving them to Dumo Network.</p>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-bold text-slate-900">Choose Import Type</h2>
        <div className="mt-4 flex flex-wrap gap-3">
          {([
            ["electoral-register", "Wards + Polling Units"],
            ["wards", "Wards Only"],
          ] as const).map(([value, label]) => (
            <button key={value} type="button" disabled={busy} onClick={() => reset(value)}
              className={`rounded-xl px-5 py-3 text-sm font-semibold transition disabled:opacity-50 ${mode === value ? "bg-slate-900 text-white" : "border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"}`}>
              {label}
            </button>
          ))}
        </div>

        <div className="mt-6 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-8 text-center">
          <h3 className="mb-3 font-semibold text-slate-900">
            {mode === "wards" ? "Ward Register CSV" : "Unified Electoral Register CSV"}
          </h3>
          <input key={mode} type="file" accept=".csv,text/csv" onChange={handleFileChange}
            disabled={busy} className="mx-auto block max-w-full text-sm text-slate-600" />
          <p className="mt-3 text-xs text-slate-500">
            Required columns: {mode === "wards" ? "state, lga, ward_number, ward_name" : "state, lga, ward_number, ward_name, code, name"}
          </p>
          <p className="mt-1 text-xs text-slate-500">UTF-8 CSV only · Maximum 5 MB · Use verified electoral records</p>
          {file && <p className="mt-3 text-sm font-semibold text-slate-800">Selected: {file.name}</p>}
        </div>

        <button type="button" onClick={handlePreview} disabled={!file || busy}
          className="mt-6 rounded-xl bg-slate-900 px-6 py-3 font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50">
          {loading ? "Validating..." : "Preview Import"}
        </button>

        {error && <div role="alert" className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

        {preview && (
          <div className="mt-8 space-y-6">
            <h3 className="text-lg font-bold text-slate-900">Import Preview</h3>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard title="Total Rows" value={preview.total_rows} />
              {isWardPreview(preview) ? (
                <>
                  <StatCard title="New Wards" value={preview.ready_count} />
                  <StatCard title="Already Existing" value={preview.skipped_count} />
                  <StatCard title="Errors" value={preview.error_count} />
                </>
              ) : (
                <>
                  <StatCard title="New Wards" value={preview.new_wards} />
                  <StatCard title="New Polling Units" value={preview.new_polling_units} />
                  <StatCard title="Errors" value={preview.errors.length} />
                </>
              )}
            </div>
            {!isWardPreview(preview) && (
              <p className="text-sm text-slate-600">Existing or repeated polling units to skip: <strong>{preview.skipped_polling_units}</strong></p>
            )}
            {isWardPreview(preview) && preview.ready.length > 0 && (
              <div>
                <h4 className="mb-3 font-semibold text-slate-900">Valid Ward Records</h4>
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="min-w-full divide-y divide-slate-200 text-sm">
                    <thead className="bg-slate-50"><tr>
                      <th className="px-4 py-3 text-left">LGA</th>
                      <th className="px-4 py-3 text-left">Ward Number</th>
                      <th className="px-4 py-3 text-left">Ward Name</th>
                    </tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {preview.ready.slice(0, 50).map((ward) => (
                        <tr key={`${ward.lga}-${ward.ward_number}`}>
                          <td className="px-4 py-3">{ward.lga}</td>
                          <td className="px-4 py-3">{ward.ward_number}</td>
                          <td className="px-4 py-3">{ward.ward_name}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {preview.ready.length > 50 && <p className="mt-2 text-xs text-slate-500">Showing the first 50 records.</p>}
              </div>
            )}
            {preview.errors.length > 0 && (
              <div>
                <h4 className="mb-3 font-semibold text-red-700">Validation Errors</h4>
                <div className="max-h-80 overflow-y-auto rounded-xl border border-red-200">
                  {preview.errors.slice(0, 100).map((item, index) => (
                    <div key={index} className="border-b border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700 last:border-0">
                      {typeof item === "string" ? item : `Row ${item.row}: ${item.error}`}
                    </div>
                  ))}
                </div>
                {preview.errors.length > 100 && <p className="mt-2 text-xs text-red-700">Showing the first 100 errors.</p>}
              </div>
            )}
            {canImport && (
              <div className="border-t border-slate-200 pt-6">
                <button type="button" onClick={handleImport} disabled={busy}
                  className="rounded-xl bg-emerald-600 px-6 py-3 font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50">
                  {importing ? "Importing..." : "Confirm & Import"}
                </button>
              </div>
            )}
            {!canImport && preview.errors.length === 0 && <p className="text-sm text-slate-500">There are no new records to import.</p>}
          </div>
        )}

        {result && (
          <div role="status" className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-800">
            <h3 className="font-bold">Import Successful</h3>
            <p className="mt-2">{result.message}</p>
            {isWardResult(result) ? (
              <p className="mt-2">Imported wards: {result.imported} · Existing wards skipped: {result.already_existing}</p>
            ) : (
              <p className="mt-2">Created wards: {result.created_wards} · Created polling units: {result.created_polling_units} · Polling units skipped: {result.skipped_polling_units}</p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
