import { useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, RefreshCw, Search, Trash2, Users } from "lucide-react";
import { useAuth } from "../context/AuthContext";

const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
const PAGE_SIZE = 15;

type Agent = { id: number; full_name: string; email: string; role?: string; is_active?: boolean };
type Election = { id: number; name: string; state?: string };
type Unit = { id: number; code: string; name: string; lga: string; ward: string; state?: string };
type Assignment = { id: number; election: Election; agent: Agent; polling_unit: Unit };

type Selection = { electionId: string; agentId: string; unitId: string; lga: string; ward: string };

function getCollection<T>(data: unknown, key: string): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === "object") {
    const object = data as Record<string, unknown>;
    if (Array.isArray(object[key])) return object[key] as T[];
    if (Array.isArray(object.items)) return object.items as T[];
    if (Array.isArray(object.results)) return object.results as T[];
  }
  throw new Error(`Unexpected response format for ${key}. Check the backend endpoint.`);
}

async function getError(response: Response): Promise<string> {
  try {
    const data = await response.json();
    if (typeof data.detail === "string") return data.detail;
    if (Array.isArray(data.detail)) return data.detail.map((x: { msg?: string }) => x.msg || "Invalid input").join("; ");
  } catch { /* response may not be JSON */ }
  return `Request failed (${response.status})`;
}

export default function AgentAssignments() {
  const { token, user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [elections, setElections] = useState<Election[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [selection, setSelection] = useState<Selection>({ electionId: "", agentId: "", unitId: "", lga: "", ward: "" });
  const [filterElection, setFilterElection] = useState("");
  const [filterLga, setFilterLga] = useState("");
  const [filterWard, setFilterWard] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!token || !isAdmin) { setLoading(false); return; }
    const controller = new AbortController();
    const headers = { Authorization: `Bearer ${token}` };
    async function load() {
      setLoading(true);
      setError("");
      try {
        const endpoints = ["/api/admin/assignments", "/api/admin/agents", "/api/admin/elections", "/api/admin/polling-units"];
        const responses = await Promise.all(endpoints.map(path => fetch(`${API_URL}${path}`, { headers, signal: controller.signal })));
        for (let i = 0; i < responses.length; i++) {
          if (!responses[i].ok) throw new Error(`${endpoints[i]}: ${await getError(responses[i])}`);
        }
        const [assignmentData, agentData, electionData, unitData] = await Promise.all(responses.map(r => r.json()));
        if (controller.signal.aborted) return;
        setAssignments(getCollection<Assignment>(assignmentData, "assignments"));
        setAgents(getCollection<Agent>(agentData, "agents").filter(a => a.role === "agent" && a.is_active !== false));
        setElections(getCollection<Election>(electionData, "elections").filter(e => !e.state || e.state.toLowerCase() === "rivers"));
        setUnits(getCollection<Unit>(unitData, "polling_units").filter(u => !u.state || u.state.toLowerCase() === "rivers"));
      } catch (err) {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Unable to load assignment data.");
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load();
    return () => controller.abort();
  }, [token, isAdmin, refreshKey]);

  const lgas = useMemo(() => [...new Set(units.map(u => u.lga))].sort(), [units]);
  const assignmentWards = useMemo(() => [...new Set(units.filter(u => !filterLga || u.lga === filterLga).map(u => u.ward))].sort(), [units, filterLga]);
  const formWards = useMemo(() => [...new Set(units.filter(u => !selection.lga || u.lga === selection.lga).map(u => u.ward))].sort(), [units, selection.lga]);
  const availableUnits = useMemo(() => units.filter(u => (!selection.lga || u.lga === selection.lga) && (!selection.ward || u.ward === selection.ward)), [units, selection.lga, selection.ward]);

  const electionAssignments = useMemo(() => assignments.filter(a => !filterElection || String(a.election.id) === filterElection), [assignments, filterElection]);
  const coveredUnitIds = useMemo(() => new Set(electionAssignments.map(a => a.polling_unit.id)), [electionAssignments]);
  const coveredAgentIds = useMemo(() => new Set(electionAssignments.map(a => a.agent.id)), [electionAssignments]);
  const filtered = useMemo(() => electionAssignments.filter(a => {
    if (filterLga && a.polling_unit.lga !== filterLga) return false;
    if (filterWard && a.polling_unit.ward !== filterWard) return false;
    const q = search.toLowerCase().trim();
    return !q || [a.election.name, a.agent.full_name, a.agent.email, a.polling_unit.name, a.polling_unit.code, a.polling_unit.lga, a.polling_unit.ward].some(value => (value || "").toLowerCase().includes(q));
  }), [electionAssignments, filterLga, filterWard, search]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice((Math.min(page, pages) - 1) * PAGE_SIZE, Math.min(page, pages) * PAGE_SIZE);
  const covered = coveredUnitIds.size;
  const uncovered = filterElection ? Math.max(0, units.length - covered) : null;

  useEffect(() => setPage(1), [filterElection, filterLga, filterWard, search]);

  async function createAssignment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !isAdmin || !selection.electionId || !selection.agentId || !selection.unitId) return;
    setSaving(true); setError(""); setSuccess("");
    try {
      const response = await fetch(`${API_URL}/api/agent-assignments`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ election_id: Number(selection.electionId), agent_id: Number(selection.agentId), polling_unit_id: Number(selection.unitId) }),
      });
      if (!response.ok) throw new Error(await getError(response));
      setSuccess("Agent assigned successfully.");
      setSelection(previous => ({ ...previous, agentId: "", unitId: "" }));
      setRefreshKey(value => value + 1);
    } catch (err) { setError(err instanceof Error ? err.message : "Could not create assignment."); }
    finally { setSaving(false); }
  }

  async function removeAssignment(assignment: Assignment) {
    if (!token || !isAdmin) return;
    if (!window.confirm(`Remove ${assignment.agent.full_name} from ${assignment.polling_unit.name} for ${assignment.election.name}?\n\nAssignments with submitted results cannot be removed.`)) return;
    setRemovingId(assignment.id); setError(""); setSuccess("");
    try {
      const response = await fetch(`${API_URL}/api/admin/assignments/${assignment.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error(await getError(response));
      setSuccess("Assignment removed successfully.");
      setRefreshKey(value => value + 1);
    } catch (err) { setError(err instanceof Error ? err.message : "Could not remove assignment."); }
    finally { setRemovingId(null); }
  }

  if (!isAdmin) return <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-800">Administrator access required.</div>;
  const inputClass = "w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800";
  const labelClass = "mb-1 block text-sm font-medium text-slate-700";

  return <div className="space-y-6">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-2xl font-bold text-slate-900">Agent Assignment Management</h1><p className="mt-1 text-sm text-slate-500">Assign registered agents to imported Rivers State polling units.</p></div>
      <button type="button" onClick={() => setRefreshKey(x => x + 1)} disabled={loading} className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm disabled:opacity-50"><RefreshCw size={16} /> Refresh</button>
    </header>

    {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"><AlertCircle size={18} className="shrink-0" />{error}</div>}
    {success && <div role="status" className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-700"><CheckCircle2 size={18} />{success}</div>}

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {[
        ["Assignments", electionAssignments.length],
        ["Assigned Agents", coveredAgentIds.size],
        ["Covered Polling Units", covered],
        ["Uncovered Polling Units", uncovered === null ? "Select election" : uncovered],
      ].map(([label, value]) => <div key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="mb-2 flex items-center gap-2 text-sm text-slate-500"><Users size={17} />{label}</div><div className="text-2xl font-bold text-slate-900">{loading ? "..." : value}</div></div>)}
    </section>
    {!filterElection && <p className="text-sm text-amber-700">Choose an election in the directory filters to calculate election-specific uncovered polling units.</p>}

    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-lg font-semibold text-slate-900">Assign an Agent</h2>
      <form onSubmit={createAssignment} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <div><label className={labelClass}>Election</label><select required className={inputClass} value={selection.electionId} onChange={e => setSelection(s => ({ ...s, electionId: e.target.value }))}><option value="">Select election</option>{elections.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select></div>
        <div><label className={labelClass}>Active Agent</label><select required className={inputClass} value={selection.agentId} onChange={e => setSelection(s => ({ ...s, agentId: e.target.value }))}><option value="">Select agent</option>{agents.map(a => <option key={a.id} value={a.id}>{a.full_name} ({a.email})</option>)}</select></div>
        <div><label className={labelClass}>LGA</label><select className={inputClass} value={selection.lga} onChange={e => setSelection(s => ({ ...s, lga: e.target.value, ward: "", unitId: "" }))}><option value="">All LGAs</option>{lgas.map(lga => <option key={lga}>{lga}</option>)}</select></div>
        <div><label className={labelClass}>Ward</label><select className={inputClass} value={selection.ward} onChange={e => setSelection(s => ({ ...s, ward: e.target.value, unitId: "" }))}><option value="">All wards</option>{formWards.map(ward => <option key={ward}>{ward}</option>)}</select></div>
        <div><label className={labelClass}>Polling Unit</label><select required className={inputClass} value={selection.unitId} onChange={e => setSelection(s => ({ ...s, unitId: e.target.value }))}><option value="">Select polling unit</option>{availableUnits.map(unit => <option key={unit.id} value={unit.id}>{unit.code} — {unit.name} ({unit.ward})</option>)}</select></div>
        <div className="flex items-end"><button type="submit" disabled={saving || loading} className="w-full rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">{saving ? "Assigning..." : "Assign Agent"}</button></div>
      </form>
    </section>

    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="space-y-4 border-b border-slate-200 p-5"><h2 className="text-lg font-semibold text-slate-900">Assignment Directory</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <select className={inputClass} value={filterElection} onChange={e => setFilterElection(e.target.value)}><option value="">All elections</option>{elections.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select>
          <select className={inputClass} value={filterLga} onChange={e => { setFilterLga(e.target.value); setFilterWard(""); }}><option value="">All LGAs</option>{lgas.map(lga => <option key={lga}>{lga}</option>)}</select>
          <select className={inputClass} value={filterWard} onChange={e => setFilterWard(e.target.value)}><option value="">All wards</option>{assignmentWards.map(ward => <option key={ward}>{ward}</option>)}</select>
          <div className="relative"><Search size={16} className="absolute left-3 top-3 text-slate-400" /><input className={`${inputClass} pl-9`} placeholder="Search assignments" value={search} onChange={e => setSearch(e.target.value)} /></div>
        </div>
      </div>
      <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm"><thead className="bg-slate-50 text-slate-600"><tr><th className="px-5 py-3">Election</th><th className="px-5 py-3">Agent</th><th className="px-5 py-3">Polling Unit</th><th className="px-5 py-3">LGA / Ward</th><th className="px-5 py-3">Action</th></tr></thead><tbody className="divide-y divide-slate-100">{visible.map(a => <tr key={a.id}><td className="px-5 py-4">{a.election.name}</td><td className="px-5 py-4"><div className="font-medium text-slate-900">{a.agent.full_name}</div><div className="text-xs text-slate-500">{a.agent.email}</div></td><td className="px-5 py-4"><div>{a.polling_unit.name}</div><div className="text-xs text-slate-500">{a.polling_unit.code}</div></td><td className="px-5 py-4">{a.polling_unit.lga}<div className="text-xs text-slate-500">{a.polling_unit.ward}</div></td><td className="px-5 py-4"><button type="button" disabled={removingId === a.id} onClick={() => void removeAssignment(a)} className="flex items-center gap-1 rounded-lg border border-red-200 px-3 py-2 text-xs font-medium text-red-700 disabled:opacity-50"><Trash2 size={14} />{removingId === a.id ? "Removing..." : "Remove"}</button></td></tr>)}{!loading && visible.length === 0 && <tr><td colSpan={5} className="px-5 py-10 text-center text-slate-500">No assignments found.</td></tr>}</tbody></table></div>
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 p-4 text-sm text-slate-600"><span>{filtered.length} matching assignments</span><div className="flex items-center gap-3"><button type="button" className="rounded-lg border px-3 py-1.5 disabled:opacity-40" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</button><span>Page {Math.min(page, pages)} of {pages}</span><button type="button" className="rounded-lg border px-3 py-1.5 disabled:opacity-40" disabled={page >= pages} onClick={() => setPage(p => p + 1)}>Next</button></div></footer>
    </section>
  </div>;
}
