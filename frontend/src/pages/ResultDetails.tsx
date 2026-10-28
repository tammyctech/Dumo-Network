import { FileText } from "lucide-react";

export default function ResultDetails() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">
          Polling-Unit Results
        </h1>

        <p className="mt-2 text-sm text-slate-500">
          Browse Rivers State polling-unit result submissions.
        </p>
      </div>

      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
        <p className="font-semibold text-amber-900">
          Unofficial — Agent-Submitted Data
        </p>

        <p className="mt-2 text-sm text-amber-800">
          These records are submitted by election monitoring
          agents and do not constitute official election results.
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
        <FileText
          size={36}
          className="mx-auto text-emerald-600"
        />

        <h2 className="mt-4 font-semibold text-slate-900">
          Polling-Unit Result Explorer
        </h2>

        <p className="mt-2 text-sm text-slate-500">
          Result browsing, party breakdowns, and supporting
          evidence will appear here when the API is connected.
        </p>
      </div>
    </div>
  );
}