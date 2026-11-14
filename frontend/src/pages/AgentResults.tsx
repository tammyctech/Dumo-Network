import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileImage,
  Send,
} from "lucide-react";

import { useAuth } from "../context/AuthContext";

const API_URL = (
  import.meta.env.VITE_API_URL || "http://127.0.0.1:8000"
).replace(/\/$/, "");

type PartyResult = {
  party: string;
  name: string;
  votes: string;
};

type RegisteredParty = { acronym: string; name: string };

// Deliberately distinct interface colors for rapid recognition during entry.
// They are not presented as the parties' official brand colors.
const PARTY_COLORS: Record<string, string> = {
  A: "#92400E",
  AA: "#A21CAF",
  AAC: "#0E7490",
  ADC: "#2563EB",
  ADP: "#C2410C",
  APC: "#15803D",
  APGA: "#0F766E",
  APM: "#B45309",
  APP: "#4338CA",
  BP: "#BE123C",
  DLA: "#0369A1",
  LP: "#4D7C0F",
  NDP: "#7E22CE",
  NDC: "#7C3AED",
  NNPP: "#B91C1C",
  NRM: "#047857",
  PDP: "#DC2626",
  PRP: "#9F1239",
  SDP: "#1D4ED8",
  YP: "#A16207",
  YPP: "#C026D3",
  ZLP: "#334155",
};

type AgentAssignment = {
  assignment_id: string;
  election: {
    id: number;
    name: string;
    election_date: string;
  };
  polling_unit: {
    id: number;
    code: string;
    name: string;
    lga: string;
    ward: string;
    state: string;
  };
};

type AssignmentsResponse = {
  state: string;
  total_assignments: number;
  assignments: AgentAssignment[];
};

type AdminElection = AgentAssignment["election"];
type AdminPollingUnit = AgentAssignment["polling_unit"] & { ward_number?: number | null };

type SubmissionResponse = {
  message: string;
  submission_id: number;
  election_id: number;
  polling_unit_id: number;
  submitted_by: number;
  data_type: string;
};

async function getApiError(response: Response): Promise<string> {
  try {
    const data = await response.json();

    if (typeof data.detail === "string") {
      return data.detail;
    }

    if (Array.isArray(data.detail)) {
      return data.detail
        .map((item: { msg?: string }) => item.msg || "Invalid input")
        .join(", ");
    }

    return data.message || `Request failed (${response.status})`;
  } catch {
    return `Request failed (${response.status})`;
  }
}

export default function AgentResults() {
  const { token, user } = useAuth();

  const [assignments, setAssignments] = useState<AgentAssignment[]>([]);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState("");
  const [adminElections, setAdminElections] = useState<AdminElection[]>([]);
  const [adminPollingUnits, setAdminPollingUnits] = useState<AdminPollingUnit[]>([]);
  const [selectedElectionId, setSelectedElectionId] = useState("");
  const [selectedPollingUnitId, setSelectedPollingUnitId] = useState("");
  const [selectedLga, setSelectedLga] = useState("");
  const [selectedWard, setSelectedWard] = useState("");

  const [loadingAssignments, setLoadingAssignments] = useState(true);
  const [assignmentError, setAssignmentError] = useState("");

  const [accreditedVoters, setAccreditedVoters] = useState("");
  const [validVotes, setValidVotes] = useState("");
  const [rejectedVotes, setRejectedVotes] = useState("");

  const [partyResults, setPartyResults] = useState<PartyResult[]>([]);
  const [currentPartyIndex, setCurrentPartyIndex] = useState(0);

  const [resultSheet, setResultSheet] = useState<File | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [savedSubmissionId, setSavedSubmissionId] = useState<number | null>(
    null
  );
  const [imageUploaded, setImageUploaded] = useState(false);

  const selectedAssignment = user?.role === "admin"
    ? (() => {
        const election = adminElections.find((item) => String(item.id) === selectedElectionId);
        const pollingUnit = adminPollingUnits.find((item) => String(item.id) === selectedPollingUnitId);
        return election && pollingUnit
          ? { assignment_id: `admin:${election.id}:${pollingUnit.id}`, election, polling_unit: pollingUnit }
          : undefined;
      })()
    : assignments.find(
        (assignment) => String(assignment.assignment_id) === selectedAssignmentId
      );

  const adminLgas = useMemo(
    () => [...new Set(adminPollingUnits.map((unit) => unit.lga))].sort(),
    [adminPollingUnits]
  );
  const adminWards = useMemo(() => {
    const values = new Map<string, number | null | undefined>();
    for (const unit of adminPollingUnits.filter((item) => item.lga === selectedLga)) {
      values.set(unit.ward, unit.ward_number);
    }
    return [...values]
      .map(([name, number]) => ({ name, number }))
      .sort((a, b) =>
        (a.number ?? Number.MAX_SAFE_INTEGER) - (b.number ?? Number.MAX_SAFE_INTEGER) ||
        a.name.localeCompare(b.name, undefined, { numeric: true })
      );
  }, [adminPollingUnits, selectedLga]);
  const filteredAdminUnits = useMemo(
    () => adminPollingUnits.filter(
      (unit) => (!selectedLga || unit.lga === selectedLga) &&
        (!selectedWard || unit.ward === selectedWard)
    ),
    [adminPollingUnits, selectedLga, selectedWard]
  );

  const totalPartyVotes = partyResults.reduce(
    (total, result) => total + (Number(result.votes) || 0),
    0
  );
  const currentPartyColor = PARTY_COLORS[partyResults[currentPartyIndex]?.party] || "#047857";

  // ==========================================
  // LOAD ASSIGNED ELECTIONS AND POLLING UNITS
  // ==========================================

  useEffect(() => {
    if (!token || !user || !["agent", "admin"].includes(user.role)) {
      setAssignments([]);
      setSelectedAssignmentId("");
      setLoadingAssignments(false);
      return;
    }

    const role = user.role;
    const controller = new AbortController();

    async function loadAssignments() {
      setLoadingAssignments(true);
      setAssignmentError("");

      try {
        const headers = { Authorization: `Bearer ${token}` };
        const partiesResponse = await fetch(`${API_URL}/api/results/political-parties`, {
          headers,
          signal: controller.signal,
        });
        if (!partiesResponse.ok) throw new Error(await getApiError(partiesResponse));
        const partiesData: { parties: RegisteredParty[] } = await partiesResponse.json();
        setPartyResults(
          partiesData.parties.map((party) => ({
            party: party.acronym,
            name: party.name,
            votes: "",
          }))
        );
        setCurrentPartyIndex(0);
        if (role === "admin") {
          const [electionsResponse, unitsResponse] = await Promise.all([
            fetch(`${API_URL}/api/admin/elections`, { headers, signal: controller.signal }),
            fetch(`${API_URL}/api/admin/polling-units`, { headers, signal: controller.signal }),
          ]);
          if (!electionsResponse.ok) throw new Error(await getApiError(electionsResponse));
          if (!unitsResponse.ok) throw new Error(await getApiError(unitsResponse));
          const electionsData = await electionsResponse.json();
          const unitsData = await unitsResponse.json();
          setAdminElections(electionsData.elections ?? []);
          setAdminPollingUnits(unitsData.polling_units ?? []);
        } else {
          const response = await fetch(`${API_URL}/api/agent/assignments`, {
            headers,
            signal: controller.signal,
          });
          if (!response.ok) throw new Error(await getApiError(response));
          const data: AssignmentsResponse = await response.json();
          if (data.state !== "Rivers") throw new Error("Only Rivers State assignments are supported.");
          setAssignments(data.assignments);
          setSelectedAssignmentId(
            data.assignments.length === 1 ? String(data.assignments[0].assignment_id) : ""
          );
        }
      } catch (err) {
        if (controller.signal.aborted) {
          return;
        }

        setAssignmentError(
          err instanceof Error
            ? err.message
            : "Unable to load agent assignments."
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoadingAssignments(false);
        }
      }
    }

    loadAssignments();

    return () => controller.abort();
  }, [token, user?.role]);

  // ==========================================
  // PARTY RESULT MANAGEMENT
  // ==========================================

  function updatePartyVotes(index: number, value: string) {
    setPartyResults((previous) =>
      previous.map((result, currentIndex) =>
        currentIndex === index
          ? { ...result, votes: value }
          : result
      )
    );
  }

  function showNextParty() {
    const current = partyResults[currentPartyIndex];
    if (!current || current.votes === "") {
      setError(`Enter the votes for ${current?.party || "this party"} before continuing.`);
      return;
    }
    setError("");
    setCurrentPartyIndex((index) => Math.min(partyResults.length - 1, index + 1));
  }

  // ==========================================
  // UPLOAD RESULT SHEET
  // ==========================================

  async function uploadResultSheet(
    submissionId: number,
    file: File
  ): Promise<void> {
    if (!token) {
      throw new Error("Your session has expired.");
    }

    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch(
      `${API_URL}/api/results/${submissionId}/upload`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      }
    );

    if (!response.ok) {
      throw new Error(await getApiError(response));
    }
  }

  // ==========================================
  // SUBMIT RESULT
  // ==========================================

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError("");
    setSuccess("");

    if (!token || !user || !["agent", "admin"].includes(user.role)) {
      setError("Only authenticated agents and administrators can submit results.");
      return;
    }

    if (!selectedAssignment) {
      setError(user.role === "admin" ? "Please select an election and polling unit." : "Please select your assigned election and polling unit.");
      return;
    }

    if (
      accreditedVoters === "" ||
      validVotes === "" ||
      rejectedVotes === "" ||
      partyResults.some(
        (result) => !result.party.trim() || result.votes === ""
      )
    ) {
      setError("Complete all required result fields.");
      return;
    }

    const accredited = Number(accreditedVoters);
    const valid = Number(validVotes);
    const rejected = Number(rejectedVotes);

    const partyNames = partyResults.map((result) =>
      result.party.trim().toUpperCase()
    );

    if (new Set(partyNames).size !== partyNames.length) {
      setError("Each political party can appear only once.");
      return;
    }

    if (totalPartyVotes !== valid) {
      setError("Total party votes must equal valid votes.");
      return;
    }

    if (valid + rejected > accredited) {
      setError("Valid and rejected votes cannot exceed accredited voters.");
      return;
    }

    if (resultSheet) {
      if (!["image/jpeg", "image/png"].includes(resultSheet.type)) {
        setError("Result sheet must be a JPEG or PNG image.");
        return;
      }

      if (resultSheet.size > 5 * 1024 * 1024) {
        setError("Result sheet must not exceed 5 MB.");
        return;
      }
    }

    setSubmitting(true);

    try {
      const response = await fetch(`${API_URL}/api/results/submit`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          election_id: selectedAssignment.election.id,
          polling_unit_id: selectedAssignment.polling_unit.id,
          accredited_voters: accredited,
          valid_votes: valid,
          rejected_votes: rejected,
          party_results: partyResults.map((result) => ({
            party: result.party.trim(),
            votes: Number(result.votes),
          })),
        }),
      });

      if (!response.ok) {
        throw new Error(await getApiError(response));
      }

      const submission: SubmissionResponse = await response.json();

      setSavedSubmissionId(submission.submission_id);

      if (resultSheet) {
        try {
          await uploadResultSheet(submission.submission_id, resultSheet);
          setImageUploaded(true);
        } catch (uploadError) {
          setError(
            `Result figures were saved as submission #${submission.submission_id}, ` +
              "but the photograph could not be uploaded. " +
              (uploadError instanceof Error
                ? uploadError.message
                : "Upload failed.") +
              " You can retry the photograph below."
          );
          return;
        }
      }

      setSuccess(
        `Unofficial result saved successfully. Submission ID: ${submission.submission_id}.`
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to submit result."
      );
    } finally {
      setSubmitting(false);
    }
  }

  // ==========================================
  // RETRY PHOTOGRAPH UPLOAD
  // ==========================================

  async function retryImageUpload() {
    if (!savedSubmissionId || !resultSheet || imageUploaded) {
      return;
    }

    setSubmitting(true);
    setError("");
    setSuccess("");

    try {
      await uploadResultSheet(savedSubmissionId, resultSheet);

      setImageUploaded(true);
      setSuccess(
        `Result sheet uploaded for submission #${savedSubmissionId}.`
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Image upload failed."
      );
    } finally {
      setSubmitting(false);
    }
  }

  function startAnotherSubmission() {
    setSavedSubmissionId(null);
    setImageUploaded(false);
    setResultSheet(null);
    setAccreditedVoters("");
    setValidVotes("");
    setRejectedVotes("");
    setPartyResults((previous) => previous.map((party) => ({ ...party, votes: "" })));
    setCurrentPartyIndex(0);
    setSuccess("");
    setError("");
    if (user?.role === "admin") setSelectedPollingUnitId("");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          Submit Polling Unit Result
        </h1>

        <p className="mt-2 text-sm text-slate-500">
          Rivers State · Unofficial Monitoring Data
        </p>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
        <div className="flex gap-3">
          <AlertCircle
            size={20}
            className="shrink-0 text-amber-600"
          />

          <p className="text-sm text-amber-900">
            Results displayed and submitted through the Dumo Youth Network
            Election Monitoring System are
            unofficial monitoring figures, not officially declared
            election results.
          </p>
        </div>
      </div>

      {assignmentError && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          Unable to load assignments: {assignmentError}
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      {success && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700"
        >
          <CheckCircle2 size={20} />
          {success}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">

        {/* ASSIGNMENT SELECTION */}

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-5 text-lg font-semibold text-slate-900">
            {user?.role === "admin" ? "Election and Polling Unit" : "Assigned Election and Polling Unit"}
          </h2>

          {user?.role === "admin" && (
            <div className="grid gap-5 md:grid-cols-2">
              <label className="block text-sm font-medium text-slate-700">
                Election
                <select
                  required
                  value={selectedElectionId}
                  disabled={loadingAssignments || submitting || savedSubmissionId !== null}
                  onChange={(event) => setSelectedElectionId(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3"
                >
                  <option value="">{loadingAssignments ? "Loading elections..." : "Select election"}</option>
                  {adminElections.map((election) => (
                    <option key={election.id} value={election.id}>{election.name}</option>
                  ))}
                </select>
              </label>

              <label className="block text-sm font-medium text-slate-700">
                LGA
                <select
                  required
                  value={selectedLga}
                  disabled={loadingAssignments || submitting || savedSubmissionId !== null}
                  onChange={(event) => {
                    setSelectedLga(event.target.value);
                    setSelectedWard("");
                    setSelectedPollingUnitId("");
                  }}
                  className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3"
                >
                  <option value="">Select LGA</option>
                  {adminLgas.map((lga) => <option key={lga} value={lga}>{lga}</option>)}
                </select>
              </label>

              <label className="block text-sm font-medium text-slate-700">
                Ward
                <select
                  required
                  value={selectedWard}
                  disabled={!selectedLga || submitting || savedSubmissionId !== null}
                  onChange={(event) => {
                    setSelectedWard(event.target.value);
                    setSelectedPollingUnitId("");
                  }}
                  className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3"
                >
                  <option value="">Select ward</option>
                  {adminWards.map((ward) => (
                    <option key={ward.name} value={ward.name}>
                      {ward.number && !/^ward\s*\d+$/i.test(ward.name.trim())
                        ? `${ward.name} (Ward ${ward.number})`
                        : ward.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-sm font-medium text-slate-700">
                Polling Unit
                <select
                  required
                  value={selectedPollingUnitId}
                  disabled={!selectedWard || submitting || savedSubmissionId !== null}
                  onChange={(event) => setSelectedPollingUnitId(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3"
                >
                  <option value="">Select polling unit</option>
                  {filteredAdminUnits.map((unit) => (
                    <option key={unit.id} value={unit.id}>{unit.code} · {unit.name}</option>
                  ))}
                </select>
              </label>
            </div>
          )}

          {user?.role === "agent" && <label className="block text-sm font-medium text-slate-700">
            Select Assignment

            <select
              required
              value={selectedAssignmentId}
              disabled={
                loadingAssignments ||
                submitting ||
                savedSubmissionId !== null
              }
              onChange={(event) =>
                setSelectedAssignmentId(event.target.value)
              }
              className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3"
            >
              <option value="">
                {loadingAssignments
                  ? "Loading assignments..."
                  : "Select your assigned polling unit"}
              </option>

              {assignments.map((assignment) => (
                <option
                  key={assignment.assignment_id}
                  value={assignment.assignment_id}
                >
                  {assignment.election.name} —{" "}
                  {assignment.polling_unit.lga} /{" "}
                  {assignment.polling_unit.ward} /{" "}
                  {assignment.polling_unit.name}
                </option>
              ))}
            </select>
          </label>}

          {user?.role === "agent" && !loadingAssignments &&
            !assignmentError &&
            assignments.length === 0 && (
              <p className="mt-3 text-sm text-amber-700">
                No polling units are assigned to your account yet.
                Contact your Dumo Youth Network Election Monitoring System administrator.
              </p>
            )}

          {selectedAssignment && (
            <div className="mt-5 grid gap-4 rounded-xl bg-slate-50 p-4 text-sm md:grid-cols-2">
              <div>
                <span className="text-slate-500">Election</span>
                <p className="font-semibold">
                  {selectedAssignment.election.name}
                </p>
              </div>

              <div>
                <span className="text-slate-500">Polling Unit</span>
                <p className="font-semibold">
                  {selectedAssignment.polling_unit.name}
                </p>
              </div>

              <div>
                <span className="text-slate-500">LGA</span>
                <p className="font-semibold">
                  {selectedAssignment.polling_unit.lga}
                </p>
              </div>

              <div>
                <span className="text-slate-500">Ward</span>
                <p className="font-semibold">
                  {selectedAssignment.polling_unit.ward}
                </p>
              </div>
            </div>
          )}
        </section>

        {/* VOTER FIGURES */}

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-5 text-lg font-semibold text-slate-900">
            Voter Figures
          </h2>

          <div className="grid gap-5 md:grid-cols-3">
            {[
              {
                label: "Accredited Voters",
                value: accreditedVoters,
                setter: setAccreditedVoters,
              },
              {
                label: "Valid Votes",
                value: validVotes,
                setter: setValidVotes,
              },
              {
                label: "Rejected Votes",
                value: rejectedVotes,
                setter: setRejectedVotes,
              },
            ].map((field) => (
              <label
                key={field.label}
                className="block text-sm font-medium text-slate-700"
              >
                {field.label}

                <input
                  type="number"
                  min="0"
                  step="1"
                  required
                  disabled={savedSubmissionId !== null}
                  value={field.value}
                  onChange={(event) =>
                    field.setter(event.target.value)
                  }
                  className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3"
                />
              </label>
            ))}
          </div>
        </section>

        {/* PARTY RESULTS */}

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-900">
              Political Party Votes
            </h2>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
              {partyResults.filter((party) => party.votes !== "").length} of {partyResults.length} completed
            </span>
          </div>

          {partyResults.length === 0 ? (
            <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800">
              Loading the INEC registered-party list…
            </p>
          ) : (
            <div
              className="rounded-2xl border p-5 transition-colors duration-200 sm:p-6"
              style={{
                borderColor: `${currentPartyColor}66`,
                backgroundColor: `${currentPartyColor}0F`,
                boxShadow: `inset 5px 0 0 ${currentPartyColor}`,
              }}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.16em]" style={{ color: currentPartyColor }}>
                    Party {currentPartyIndex + 1} of {partyResults.length}
                  </p>
                  <h3 className="mt-2 text-3xl font-black" style={{ color: currentPartyColor }}>
                    {partyResults[currentPartyIndex]?.party}
                  </h3>
                  <p className="mt-1 text-sm font-medium text-slate-700">
                    {partyResults[currentPartyIndex]?.name}
                  </p>
                </div>
                <CheckCircle2
                  size={25}
                  style={{
                    color: partyResults[currentPartyIndex]?.votes !== "" ? currentPartyColor : `${currentPartyColor}40`,
                  }}
                />
              </div>

              <label className="mt-6 block text-sm font-semibold text-slate-800">
                Number of votes
                <input
                  key={currentPartyIndex}
                  autoFocus
                  type="number"
                  min="0"
                  step="1"
                  required
                  disabled={savedSubmissionId !== null}
                  aria-label={`${partyResults[currentPartyIndex]?.party} votes`}
                  placeholder="Enter 0 if the party received no votes"
                  value={partyResults[currentPartyIndex]?.votes ?? ""}
                  onChange={(event) => updatePartyVotes(currentPartyIndex, event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      showNextParty();
                    }
                  }}
                  className="mt-2 w-full rounded-xl border bg-white px-4 py-4 text-xl font-bold outline-none focus:ring-2 focus:ring-slate-200"
                  style={{ borderColor: `${currentPartyColor}80` }}
                />
              </label>

              <div className="mt-5 flex justify-between gap-3">
                <button
                  type="button"
                  disabled={currentPartyIndex === 0 || savedSubmissionId !== null}
                  onClick={() => setCurrentPartyIndex((index) => Math.max(0, index - 1))}
                  className="inline-flex items-center gap-2 rounded-xl border bg-white px-4 py-3 text-sm font-semibold disabled:opacity-40"
                >
                  <ChevronLeft size={17} /> Back
                </button>
                <button
                  type="button"
                  disabled={savedSubmissionId !== null || partyResults[currentPartyIndex]?.votes === ""}
                  onClick={showNextParty}
                  className="inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold text-white disabled:opacity-40"
                  style={{ backgroundColor: currentPartyColor }}
                >
                  {currentPartyIndex === partyResults.length - 1 ? "All parties completed" : "Save & next party"}
                  {currentPartyIndex < partyResults.length - 1 && <ChevronRight size={17} />}
                </button>
              </div>
            </div>
          )}

          {partyResults.length > 0 && (
            <div className="mt-4 grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-11" aria-label="Political party entry navigation">
              {partyResults.map((party, index) => {
                const color = PARTY_COLORS[party.party] || "#475569";
                const active = index === currentPartyIndex;
                return (
                  <button
                    key={party.party}
                    type="button"
                    onClick={() => setCurrentPartyIndex(index)}
                    disabled={savedSubmissionId !== null}
                    title={`${party.party} — ${party.name}`}
                    aria-label={`${party.party}${party.votes !== "" ? `, ${party.votes} votes entered` : ", not completed"}`}
                    className="rounded-lg border px-2 py-2 text-xs font-black transition hover:-translate-y-0.5 disabled:opacity-50"
                    style={{
                      borderColor: color,
                      backgroundColor: active ? color : party.votes !== "" ? `${color}20` : "#ffffff",
                      color: active ? "#ffffff" : color,
                      boxShadow: active ? `0 0 0 2px ${color}30` : "none",
                    }}
                  >
                    {party.party}
                  </button>
                );
              })}
            </div>
          )}

          <p className="mt-3 text-xs text-slate-500">
            Official INEC register for the 2027 General Election. Enter zero for any party with no votes.
          </p>

          <div className="mt-6 rounded-xl bg-slate-50 p-4">
            <div className="flex justify-between text-sm">
              <span>Total Party Votes</span>
              <strong>{totalPartyVotes.toLocaleString()}</strong>
            </div>

            <div className="mt-2 flex justify-between text-sm">
              <span>Valid Votes</span>
              <strong>
                {Number(validVotes || 0).toLocaleString()}
              </strong>
            </div>
          </div>
        </section>

        {/* RESULT SHEET */}

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-3">
            <FileImage size={24} className="text-emerald-600" />

            <h2 className="text-lg font-semibold text-slate-900">
              Result Sheet Photograph
            </h2>
          </div>

          <input
            type="file"
            accept="image/jpeg,image/png"
            disabled={imageUploaded || submitting}
            onChange={(event) =>
              setResultSheet(event.target.files?.[0] || null)
            }
            className="block w-full rounded-xl border border-slate-300 p-3 text-sm"
          />

          <p className="mt-3 text-xs text-slate-500">
            JPEG or PNG, maximum 5 MB.
          </p>
        </section>

        {/* SUBMIT */}

        {savedSubmissionId === null ? (
          <button
            type="submit"
            disabled={
              submitting ||
              loadingAssignments ||
              !selectedAssignment ||
              !token ||
              !user ||
              !["agent", "admin"].includes(user.role)
            }
            className="flex w-full items-center justify-center gap-3 rounded-xl bg-emerald-600 px-6 py-4 font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Send size={20} />
            {submitting ? "Submitting..." : "Submit Unofficial Result"}
          </button>
        ) : (
          <div className="rounded-xl border border-emerald-200 bg-white p-5">
            <p className="text-sm font-semibold text-slate-900">
              Result figures saved as submission #{savedSubmissionId}.
            </p>

            {!imageUploaded && resultSheet && (
              <button
                type="button"
                onClick={retryImageUpload}
                disabled={submitting}
                className="mt-4 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
              >
                {submitting ? "Uploading..." : "Retry Photograph Upload"}
              </button>
            )}

            <p className="mt-3 text-xs text-slate-500">
              Do not submit the same result figures again.
            </p>

            {(imageUploaded || !resultSheet) && (
              <button
                type="button"
                onClick={startAnotherSubmission}
                className="mt-4 rounded-xl border border-emerald-300 bg-emerald-50 px-5 py-3 text-sm font-semibold text-emerald-800 hover:bg-emerald-100"
              >
                Submit another polling-unit result
              </button>
            )}
          </div>
        )}
      </form>
    </div>
  );
}
