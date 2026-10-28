import { useEffect, useMemo, useState, type FormEvent } from "react";

import {

  CalendarDays,

  Users,

  MapPin,

  PlusCircle,

  CheckCircle2,

  AlertCircle,

  RefreshCw,


} from "lucide-react";

import { useAuth } from "../context/AuthContext";



const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";



const RIVERS_LGAS = [

  "Abua/Odual", "Ahoada East", "Ahoada West", "Akuku-Toru", "Andoni",

  "Asari-Toru", "Bonny", "Degema", "Eleme", "Emohua", "Etche",

  "Gokana", "Ikwerre", "Khana", "Obio/Akpor", "Ogba/Egbema/Ndoni",

  "Ogu/Bolo", "Okrika", "Omuma", "Opobo/Nkoro", "Oyigbo",

  "Port Harcourt", "Tai",

];



type Election = { id: number; name: string; election_date: string };

type PollingUnit = {

  id: number;

  code: string;

  name: string;

  lga: string;

  ward: string;

};

type Ward = { id: number; name: string; ward_number: number };
type WardsResponse = { state: string; lga: string; total_wards: number; wards: Ward[] };
type Agent = { id: number; full_name: string; email: string };

type ElectionResponse = Election & { state: string };

type AssignmentResponse = {

  message: string;

  election_id: number;

  polling_unit_id: number;

  agent_id: number;

};



async function readApiError(response: Response): Promise<string> {

  try {

const data = await response.json();

    if (typeof data.detail === "string") return data.detail;

    if (Array.isArray(data.detail)) {

      return data.detail.map((item: { msg?: string }) => item.msg || "Invalid input").join(", ");

    }

    return data.message || `Request failed (${response.status})`;

  } catch {

    return `Request failed (${response.status})`;

  }

}



function uniqueSorted(values: string[]): string[] {

  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort(

    (a, b) => a.localeCompare(b, undefined, { numeric: true })

  );

}



export default function AdminElections() {

const { token, user } = useAuth();

const isAdmin = user?.role === "admin";



const [electionName, setElectionName] = useState("");

const [electionDate, setElectionDate] = useState("");

const [elections, setElections] = useState<Election[]>([]);

const [pollingUnits, setPollingUnits] = useState<PollingUnit[]>([]);

const [agents, setAgents] = useState<Agent[]>([]);
const [registeredWards, setRegisteredWards] = useState<Ward[]>([]);
const [loadingWards, setLoadingWards] = useState(false);
const [wardError, setWardError] = useState("");



const [selectedElection, setSelectedElection] = useState("");

const [selectedLga, setSelectedLga] = useState("");

const [selectedWard, setSelectedWard] = useState("");

const [selectedPollingUnit, setSelectedPollingUnit] = useState("");

const [selectedAgent, setSelectedAgent] = useState("");





const [loadingOptions, setLoadingOptions] = useState(true);

const [creating, setCreating] = useState(false);

const [assigning, setAssigning] = useState(false);

const [refreshKey, setRefreshKey] = useState(0);

const [error, setError] = useState("");

const [success, setSuccess] = useState("");



  useEffect(() => {

    if (!token || !isAdmin) {

      setLoadingOptions(false);

      return;

    }



const controller = new AbortController();

    async function loadOptions() {

      setLoadingOptions(true);

      setError("");

      try {

const headers = { Authorization: `Bearer ${token}` };

const [electionsResponse, unitsResponse, agentsResponse] = await Promise.all([

          fetch(`${API_URL}/api/admin/elections`, { headers, signal: controller.signal }),

          fetch(`${API_URL}/api/admin/polling-units`, { headers, signal: controller.signal }),

          fetch(`${API_URL}/api/admin/agents`, { headers, signal: controller.signal }),

        ]);



        if (!electionsResponse.ok) throw new Error(await readApiError(electionsResponse));

        if (!unitsResponse.ok) throw new Error(await readApiError(unitsResponse));

        if (!agentsResponse.ok) throw new Error(await readApiError(agentsResponse));



const [electionsData, unitsData, agentsData] = await Promise.all([

          electionsResponse.json(), unitsResponse.json(), agentsResponse.json(),

        ]);

        if (electionsData.state !== "Rivers" || unitsData.state !== "Rivers") {

          throw new Error("Only Rivers State election records are supported.");

        }

        if (controller.signal.aborted) return;

        setElections(Array.isArray(electionsData.elections) ? electionsData.elections : []);

        setPollingUnits(Array.isArray(unitsData.polling_units) ? unitsData.polling_units : []);

        setAgents(Array.isArray(agentsData.agents) ? agentsData.agents : []);

      } catch (err) {

        if (!controller.signal.aborted) {

          setError(err instanceof Error ? err.message : "Unable to load administration options.");

        }

      } finally {

        if (!controller.signal.aborted) setLoadingOptions(false);

      }

    }

    void loadOptions();

    return () => controller.abort();

  }, [token, isAdmin, refreshKey]);



  useEffect(() => {
    setRegisteredWards([]);
    setWardError("");
    if (!selectedLga || !token || !isAdmin) {
      setLoadingWards(false);
      return;
    }
    const controller = new AbortController();
    async function loadWards() {
      setLoadingWards(true);
      try {
        const response = await fetch(
          `${API_URL}/api/wards?lga=${encodeURIComponent(selectedLga)}`,
          { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal }
        );
        if (!response.ok) throw new Error(await readApiError(response));
        const data: WardsResponse = await response.json();
        if (!Array.isArray(data.wards)) throw new Error("Invalid ward response from server.");
        if (!controller.signal.aborted) setRegisteredWards(data.wards);
      } catch (err) {
        if (!controller.signal.aborted) setWardError(err instanceof Error ? err.message : "Unable to load wards.");
      } finally {
        if (!controller.signal.aborted) setLoadingWards(false);
      }
    }
    void loadWards();
    return () => controller.abort();
  }, [selectedLga, token, isAdmin, refreshKey]);

  const wards = useMemo(() => uniqueSorted(registeredWards.map((ward) => ward.name)), [registeredWards]);

const filteredPollingUnits = useMemo(() => {
    if (!selectedLga || !selectedWard) return [];
    return pollingUnits.filter((unit) =>
      unit.lga?.trim().toLowerCase() === selectedLga.toLowerCase() &&
      unit.ward?.trim().toLowerCase() === selectedWard.toLowerCase()
    );
  }, [pollingUnits, selectedLga, selectedWard]);



  async function createElection(event: FormEvent<HTMLFormElement>) {

    event.preventDefault();

    setError("");

    setSuccess("");

    if (!token || !isAdmin) return setError("Administrator access required.");

    if (!electionName.trim() || !electionDate) return setError("Enter the election name and date.");

    setCreating(true);

    try {

const response = await fetch(`${API_URL}/api/elections`, {

        method: "POST",

        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },

        body: JSON.stringify({

          name: electionName.trim(),

          election_date: new Date(electionDate).toISOString(),

        }),

      });

      if (!response.ok) throw new Error(await readApiError(response));

const election: ElectionResponse = await response.json();

      setElections((previous) => [{ id: election.id, name: election.name, election_date: election.election_date }, ...previous]);

      setSelectedElection(String(election.id));

      setElectionName("");

      setElectionDate("");

      setSuccess(`Election "${election.name}" created successfully.`);

    } catch (err) {

      setError(err instanceof Error ? err.message : "Unable to create election.");

    } finally {

      setCreating(false);

    }

  }



  async function assignAgent(event: FormEvent<HTMLFormElement>) {

    event.preventDefault();

    setError("");

    setSuccess("");

    if (!token || !isAdmin) return setError("Administrator access required.");

    if (!selectedElection || !selectedLga || !selectedWard || !selectedPollingUnit || !selectedAgent) {

      return setError("Select an election, LGA, ward, polling unit, and agent.");

    }

const unit = pollingUnits.find((item) => item.id === Number(selectedPollingUnit));

    if (!unit || unit.lga?.trim().toLowerCase() !== selectedLga.toLowerCase() || unit.ward?.trim() !== selectedWard) {

      return setError("The polling unit does not belong to the selected LGA and ward.");

    }

    setAssigning(true);

    try {

const response = await fetch(`${API_URL}/api/agent-assignments`, {

        method: "POST",

        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },

        body: JSON.stringify({

          election_id: Number(selectedElection),

          polling_unit_id: Number(selectedPollingUnit),

          agent_id: Number(selectedAgent),

        }),

      });

      if (!response.ok) throw new Error(await readApiError(response));

const assignment: AssignmentResponse = await response.json();

const agent = agents.find((item) => item.id === assignment.agent_id);

const assignedUnit = pollingUnits.find((item) => item.id === assignment.polling_unit_id);

      setSuccess(`${agent?.full_name || "Agent"} successfully assigned to ${assignedUnit?.name || "polling unit"}.`);

      setSelectedPollingUnit("");

      setSelectedAgent("");

      

    } catch (err) {

      setError(err instanceof Error ? err.message : "Unable to assign agent.");

    } finally {

      setAssigning(false);

    }

  }



const inputClass = "mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3";



  if (!isAdmin) {

    return (

      <div className="rounded-xl border border-red-200 bg-red-50 p-6">

        <h1 className="text-lg font-semibold text-red-800">Access Restricted</h1>

        <p className="mt-2 text-sm text-red-700">Election administration is available only to administrators.</p>

      </div>

    );

  }



  return (

    <div className="space-y-6">

      <div className="flex flex-wrap items-center justify-between gap-4">

        <div>

          <h1 className="text-2xl font-bold text-slate-900">Election Administration</h1>

          <p className="mt-2 text-sm text-slate-500">Manage Rivers State elections and polling-unit assignments.</p>

        </div>

        <button type="button" disabled={loadingOptions} onClick={() => setRefreshKey((value) => value + 1)}

          className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">

          <RefreshCw size={17} /> Refresh Data

        </button>

      </div>



      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">

        <div className="flex items-center gap-2 text-sm font-semibold text-amber-900">

          <AlertCircle size={18} /> Unofficial — Agent-Submitted Data

        </div>

        <p className="mt-2 text-sm text-amber-800">Dumo Youth Network collects unofficial election information submitted by assigned polling-unit agents. These figures are not officially declared election results.</p>

      </div>



      {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      {success && <div role="status" className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700"><CheckCircle2 size={18} />{success}</div>}



      <div className="grid gap-4 md:grid-cols-3">

        {[

          { label: "Elections", value: elections.length, icon: CalendarDays },

          { label: "Polling Units", value: pollingUnits.length, icon: MapPin },

          { label: "Registered Agents", value: agents.length, icon: Users },

        ].map((card) => {

const Icon = card.icon;

          return (

            <div key={card.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">

              <div className="flex items-center justify-between"><p className="text-sm text-slate-500">{card.label}</p><Icon size={20} className="text-emerald-600" /></div>

              <p className="mt-3 text-3xl font-bold text-slate-900">{loadingOptions ? "..." : card.value}</p>

            </div>

          );

        })}

      </div>



      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">

        <div className="mb-5 flex items-center gap-3"><CalendarDays size={23} className="text-emerald-600" /><h2 className="text-lg font-semibold text-slate-900">Create Election</h2></div>

        <form onSubmit={createElection} className="space-y-5">

          <label className="block text-sm font-medium text-slate-700">Election Name

            <input type="text" required maxLength={200} value={electionName} onChange={(event) => setElectionName(event.target.value)} placeholder="e.g. Rivers State Governorship Election" className={inputClass} />

          </label>

          <label className="block text-sm font-medium text-slate-700">Election Date and Time

            <input type="datetime-local" required value={electionDate} onChange={(event) => setElectionDate(event.target.value)} className={inputClass} />

          </label>

          <button type="submit" disabled={creating || !token} className="flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"><PlusCircle size={18} />{creating ? "Creating..." : "Create Election"}</button>

        </form>

      </section>



      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">

        <div className="mb-5 flex items-center gap-3"><Users size={23} className="text-emerald-600" /><h2 className="text-lg font-semibold text-slate-900">Assign Agent to Polling Unit</h2></div>

        <form onSubmit={assignAgent} className="space-y-5">

          <label className="block text-sm font-medium text-slate-700">Select Election

            <select required value={selectedElection} disabled={loadingOptions || assigning} onChange={(event) => setSelectedElection(event.target.value)} className={inputClass}>

              <option value="">Choose an election</option>

              {elections.map((election) => <option key={election.id} value={election.id}>{election.name}</option>)}

            </select>

          </label>



          <label className="block text-sm font-medium text-slate-700">Select LGA

            <select required value={selectedLga} disabled={loadingOptions || assigning} onChange={(event) => {

              setSelectedLga(event.target.value);

              setSelectedWard("");

              setSelectedPollingUnit("");

              

            }} className={inputClass}>

              <option value="">Choose an LGA</option>

              {RIVERS_LGAS.map((lga) => <option key={lga} value={lga}>{lga}</option>)}

            </select>

          </label>



          <label className="block text-sm font-medium text-slate-700">Select Ward

            <select required value={selectedWard} disabled={loadingOptions || loadingWards || assigning || !selectedLga || wards.length === 0} onChange={(event) => {

              setSelectedWard(event.target.value);

              setSelectedPollingUnit("");

              

            }} className={inputClass}>

              <option value="">{!selectedLga ? "Select an LGA first" : loadingWards ? "Loading wards..." : wards.length === 0 ? "No registered wards for this LGA" : "Choose a ward"}</option>

              {wards.map((ward) => <option key={ward} value={ward}>{ward}</option>)}

            </select>

          </label>

          {selectedLga && !loadingWards && !wardError && wards.length === 0 && (

            <p className="text-sm text-amber-700">No registered wards were returned for {selectedLga}. Check Ward Management.</p>

          )}



          {wardError && <p role="alert" className="text-sm text-red-700">Unable to load wards: {wardError}</p>}
          {selectedWard && filteredPollingUnits.length === 0 && <p className="text-sm text-amber-700">No polling units registered for this ward.</p>}

          <label className="block text-sm font-medium text-slate-700">Select Polling Unit

            <select required value={selectedPollingUnit} disabled={loadingOptions || assigning || !selectedWard || filteredPollingUnits.length === 0} onChange={(event) => setSelectedPollingUnit(event.target.value)} className={inputClass}>

              <option value="">{!selectedWard ? "Select a ward first" : filteredPollingUnits.length === 0 ? "No polling units found" : "Choose a polling unit"}</option>

              {filteredPollingUnits.map((unit) => <option key={unit.id} value={unit.id}>{unit.name} ({unit.code})</option>)}

            </select>

          </label>



          <label className="block text-sm font-medium text-slate-700">Select Agent

            <select required value={selectedAgent} disabled={loadingOptions || assigning} onChange={(event) => setSelectedAgent(event.target.value)} className={inputClass}>

              <option value="">Choose an agent</option>

              {agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.full_name} — {agent.email}</option>)}

            </select>

          </label>

          {agents.length === 0 && !loadingOptions && <p className="text-sm text-amber-700">No agent accounts were returned by the administration API.</p>}

          <button type="submit" disabled={assigning || loadingOptions || !selectedElection || !selectedLga || !selectedWard || !selectedPollingUnit || !selectedAgent}

            className="flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"><Users size={18} />{assigning ? "Assigning..." : "Assign Agent"}</button>

        </form>

      </section>

    </div>

  );

}
