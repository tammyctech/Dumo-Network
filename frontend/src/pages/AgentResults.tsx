import { useEffect, useState, type FormEvent } from "react";
import {
  AlertCircle,
  CheckCircle2,
  FileImage,
  Plus,
  Send,
  Trash2,
} from "lucide-react";

import { useAuth } from "../context/AuthContext";

const API_URL = (
  import.meta.env.VITE_API_URL || "http://127.0.0.1:8000"
).replace(/\/$/, "");

type PartyResult = {
  party: string;
  votes: string;
};

type AgentAssignment = {
  assignment_id: number;
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

  const [loadingAssignments, setLoadingAssignments] = useState(true);
  const [assignmentError, setAssignmentError] = useState("");

  const [accreditedVoters, setAccreditedVoters] = useState("");
  const [validVotes, setValidVotes] = useState("");
  const [rejectedVotes, setRejectedVotes] = useState("");

  const [partyResults, setPartyResults] = useState<PartyResult[]>([
    { party: "", votes: "" },
  ]);

  const [resultSheet, setResultSheet] = useState<File | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [savedSubmissionId, setSavedSubmissionId] = useState<number | null>(
    null
  );
  const [imageUploaded, setImageUploaded] = useState(false);

  const selectedAssignment = assignments.find(
    (assignment) => String(assignment.assignment_id) === selectedAssignmentId
  );

  const totalPartyVotes = partyResults.reduce(
    (total, result) => total + (Number(result.votes) || 0),
    0
  );

  // ==========================================
  // LOAD ASSIGNED ELECTIONS AND POLLING UNITS
  // ==========================================

  useEffect(() => {
    if (!token || user?.role !== "agent") {
      setAssignments([]);
      setSelectedAssignmentId("");
      setLoadingAssignments(false);
      return;
    }

    const controller = new AbortController();

    async function loadAssignments() {
      setLoadingAssignments(true);
      setAssignmentError("");

      try {
        const response = await fetch(`${API_URL}/api/agent/assignments`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(await getApiError(response));
        }

        const data: AssignmentsResponse = await response.json();

        if (data.state !== "Rivers") {
          throw new Error("Only Rivers State assignments are supported.");
        }

        setAssignments(data.assignments);

        setSelectedAssignmentId(
          data.assignments.length === 1
            ? String(data.assignments[0].assignment_id)
            : ""
        );
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

  function updateParty(
    index: number,
    field: keyof PartyResult,
    value: string
  ) {
    setPartyResults((previous) =>
      previous.map((result, currentIndex) =>
        currentIndex === index
          ? { ...result, [field]: value }
          : result
      )
    );
  }

  function addParty() {
    setPartyResults((previous) => [
      ...previous,
      { party: "", votes: "" },
    ]);
  }

  function removeParty(index: number) {
    setPartyResults((previous) =>
      previous.filter((_, currentIndex) => currentIndex !== index)
    );
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

    if (!token || user?.role !== "agent") {
      setError("Only authenticated agents can submit results.");
      return;
    }

    if (!selectedAssignment) {
      setError("Please select your assigned election and polling unit.");
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          Submit Polling Unit Result
        </h1>

        <p className="mt-2 text-sm text-slate-500">
          Rivers State · Unofficial — Agent-Submitted Data
        </p>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
        <div className="flex gap-3">
          <AlertCircle
            size={20}
            className="shrink-0 text-amber-600"
          />

          <p className="text-sm text-amber-900">
            Results displayed and submitted through Dumo Network are
            unofficial agent-submitted figures, not officially declared
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
            Assigned Election and Polling Unit
          </h2>

          <label className="block text-sm font-medium text-slate-700">
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
          </label>

          {!loadingAssignments &&
            !assignmentError &&
            assignments.length === 0 && (
              <p className="mt-3 text-sm text-amber-700">
                No polling units are assigned to your account yet.
                Contact your Dumo Network administrator.
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
          <div className="mb-5 flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-900">
              Party Results
            </h2>

            <button
              type="button"
              onClick={addParty}
              disabled={savedSubmissionId !== null}
              className="flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 disabled:opacity-50"
            >
              <Plus size={16} />
              Add Party
            </button>
          </div>

          <div className="space-y-4">
            {partyResults.map((result, index) => (
              <div
                key={index}
                className="grid gap-3 md:grid-cols-[1fr_1fr_auto]"
              >
                <input
                  type="text"
                  required
                  disabled={savedSubmissionId !== null}
                  aria-label={`Party ${index + 1} name`}
                  placeholder="Party name, e.g. APC"
                  value={result.party}
                  onChange={(event) =>
                    updateParty(index, "party", event.target.value)
                  }
                  className="rounded-xl border border-slate-300 px-4 py-3"
                />

                <input
                  type="number"
                  min="0"
                  step="1"
                  required
                  disabled={savedSubmissionId !== null}
                  aria-label={`Party ${index + 1} votes`}
                  placeholder="Votes"
                  value={result.votes}
                  onChange={(event) =>
                    updateParty(index, "votes", event.target.value)
                  }
                  className="rounded-xl border border-slate-300 px-4 py-3"
                />

                <button
                  type="button"
                  disabled={
                    partyResults.length === 1 ||
                    savedSubmissionId !== null
                  }
                  onClick={() => removeParty(index)}
                  aria-label={`Remove party ${index + 1}`}
                  className="rounded-xl p-3 text-red-500 hover:bg-red-50 disabled:opacity-30"
                >
                  <Trash2 size={20} />
                </button>
              </div>
            ))}
          </div>

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
              user?.role !== "agent"
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
          </div>
        )}
      </form>
    </div>
  );
}
