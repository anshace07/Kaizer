"use client";

import { useEffect, useState } from "react";
import {
  Cpu,
  AlertTriangle,
  MapPin,
  ShieldCheck,
  Pencil,
  Check,
  Loader2,
  AudioLines,
  FileText,
  ArrowLeft,
  Keyboard,
  Volume2,
} from "lucide-react";

import {
  api,
  type Analysis,
  type Machine,
  type IncidentDetail,
  type Severity,
} from "@/lib/api";

import { capitalize } from "@/lib/format";
import { say } from "@/lib/voice";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type ConfirmDetailsProps = {
  analysis: Analysis;
  machines: Machine[];
  source: "voice" | "upload" | "typed";
  onBack: () => void;
  onCreated: (incident: IncidentDetail) => void;
};

const severityStyles: Record<Severity, string> = {
  critical: "border-red-200 bg-red-100 text-red-700",
  high: "border-orange-200 bg-orange-100 text-orange-700",
  medium: "border-amber-200 bg-amber-100 text-amber-700",
  low: "border-emerald-200 bg-emerald-100 text-emerald-700",
};

export function ConfirmDetails({
  analysis,
  machines,
  source,
  onBack,
  onCreated,
}: ConfirmDetailsProps) {
  const extraction = analysis.extraction;

  const machineCandidates = extraction.machine_candidates ?? [];

  // Derive confirmation defensively instead of trusting only the LLM.
  const confirmationRequired =
    extraction.confirmation_required ||
    machineCandidates.length > 1 ||
    !extraction.machine_id;

  const [machineId, setMachineId] = useState(
    confirmationRequired ? "" : extraction.machine_id ?? ""
  );

  const [incidentType, setIncidentType] = useState(
    extraction.incident_type
  );

  const [location, setLocation] = useState(
    extraction.location ?? ""
  );

  const [severity, setSeverity] = useState<Severity>(
    analysis.severity
  );

  const [symptoms, setSymptoms] = useState(
    extraction.reported_symptoms.join(", ")
  );

  const [editing, setEditing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedMachine = machines.find(
    (machine) => machine.id === machineId
  );

  // A machine must always be selected before creating an incident.
  const machineMissing = !machineId;

  const isTyped = source === "typed";

  const reportTitle =
    source === "typed"
      ? "Typed Report"
      : source === "upload"
        ? "Uploaded Audio Report"
        : "Voice Report";

  // Automatically speak the machine confirmation question.
  useEffect(() => {
    if (!confirmationRequired) return;

    const question = extraction.confirmation_question;
    const spokenQuestion = analysis.spoken_question || question;

    if (!spokenQuestion) return;

    void say(spokenQuestion, question || spokenQuestion).catch(() => {
      // Audio playback failure must not block machine selection.
    });
  }, [
    confirmationRequired,
    extraction.confirmation_question,
    analysis.spoken_question,
  ]);

  function selectMachine(id: string) {
    setMachineId(id);
    setError(null);

    const machine = machines.find(
      (item) => item.id === id
    );

    if (machine) {
      setLocation(machine.location);
    } else {
      setLocation("");
    }
  }

  async function playQuestion() {
    const question = extraction.confirmation_question;
    const spokenQuestion = analysis.spoken_question || question;

    if (!spokenQuestion) return;

    try {
      await say(
        spokenQuestion,
        question || spokenQuestion
      );
    } catch {
      setError(
        "Unable to play the confirmation question. You can still select the machine manually."
      );
    }
  }

  async function createIncident() {
    if (creating) return;

    if (!machineId) {
      setError(
        "Please select the correct machine before creating the incident."
      );
      return;
    }

    if (!incidentType.trim()) {
      setError("Please enter an incident type.");
      return;
    }

    const validMachine = machines.find(
      (machine) => machine.id === machineId
    );

    if (!validMachine) {
      setError("Please select a valid machine.");
      return;
    }

    setCreating(true);
    setError(null);

    try {
      const incident = await api.createIncident({
        machine_id: machineId,
        incident_type: incidentType,
        severity,
        symptoms: symptoms
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        transcript: analysis.transcript,
        language: extraction.language || null,
        analysis,
      });

      onCreated(incident);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Unable to create the incident. Please try again."
      );
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="min-h-full space-y-6 rounded-2xl bg-[#f5f2ff] p-2 sm:p-4">

      {/* HEADER */}
      <div>
        <div className="mb-2 flex items-center gap-2">
          <span className="rounded-full bg-violet-100 px-3 py-1 text-[11px] font-bold tracking-wide text-violet-700">
            AI UNDERSTANDING
          </span>

          <span className="flex items-center gap-1 text-xs font-medium text-emerald-600">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            Analysis complete
          </span>
        </div>

        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          Confirm Details
        </h1>

        <p className="mt-2 text-sm text-slate-500">
          We&apos;ve understood your report like this. Please confirm
          that the extracted details are correct.
        </p>
      </div>

      {/* CONFIRMATION CARD */}
      <Card className="overflow-hidden rounded-3xl border border-violet-100 bg-white shadow-sm">
        <CardContent className="p-4 sm:p-6">

          <div className="grid gap-5 lg:grid-cols-2">

            {/* LEFT: INCIDENT DETAILS */}
            <div className="rounded-2xl border border-slate-100 bg-[#fcfbff] p-5 sm:p-6">

              <div className="mb-6 flex items-center gap-2">
                <div className="rounded-xl bg-violet-100 p-2">
                  <FileText className="h-5 w-5 text-violet-700" />
                </div>

                <div>
                  <h2 className="font-bold text-slate-900">
                    Incident Details
                  </h2>

                  <p className="text-xs text-slate-400">
                    AI-extracted information
                  </p>
                </div>
              </div>

              {/* MACHINE CONFIRMATION */}
              {confirmationRequired && (
                <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4">

                  <div className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />

                    <div>
                      <h3 className="text-sm font-bold text-amber-900">
                        Confirm the machine
                      </h3>

                      <p className="mt-1 text-sm leading-6 text-amber-800">
                        {extraction.confirmation_question ||
                          "Which machine are you referring to?"}
                      </p>
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={playQuestion}
                    className="mt-3 border-amber-300 bg-white text-amber-800 hover:bg-amber-100"
                  >
                    <Volume2 className="mr-2 h-4 w-4" />
                    Play question
                  </Button>

                  {/* MACHINE CANDIDATES */}
                  {machineCandidates.length > 0 && (
                    <div className="mt-4">
                      <p className="mb-2 text-xs font-semibold text-amber-900">
                        Possible machines
                      </p>

                      <div className="flex flex-wrap gap-2">
                        {machineCandidates.map((candidateId) => {
                          const candidate = machines.find(
                            (machine) => machine.id === candidateId
                          );

                          if (!candidate) return null;

                          const isSelected =
                            machineId === candidateId;

                          return (
                            <button
                              key={candidateId}
                              type="button"
                              aria-pressed={isSelected}
                              onClick={() => selectMachine(candidateId)}
                              className={`rounded-lg border px-4 py-2 text-sm font-semibold transition ${
                                isSelected
                                  ? "border-violet-600 bg-violet-600 text-white"
                                  : "border-violet-200 bg-white text-violet-800 hover:border-violet-400 hover:bg-violet-50"
                              }`}
                            >
                              {candidate.id}

                              <span className="ml-1 text-xs font-normal">
                                {candidate.name}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* ALL MACHINES DROPDOWN */}
                  <div className="mt-4">
                    <label className="mb-2 block text-xs font-semibold text-amber-900">
                      Or select from all machines
                    </label>

                    <select
                      value={machineId}
                      onChange={(event) =>
                        selectMachine(event.target.value)
                      }
                      className="w-full rounded-lg border border-amber-300 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-violet-200"
                    >
                      <option value="">
                        Select the correct machine
                      </option>

                      {machines.map((machine) => (
                        <option
                          key={machine.id}
                          value={machine.id}
                        >
                          {machine.id} - {machine.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {machineMissing && (
                    <p className="mt-2 text-xs font-medium text-red-600">
                      Pick the machine first.
                    </p>
                  )}

                  {!machineMissing && (
                    <p className="mt-2 text-xs font-medium text-emerald-700">
                      Selected machine: {machineId}
                    </p>
                  )}
                </div>
              )}

              <div className="space-y-6">

                {/* MACHINE */}
                <div className="grid grid-cols-[145px_1fr] items-center gap-3">
                  <div className="flex items-center gap-2 text-sm text-slate-500">
                    <Cpu className="h-4 w-4 text-violet-600" />
                    Machine ID
                  </div>

                  {editing ? (
                    <select
                      value={machineId}
                      onChange={(event) =>
                        selectMachine(event.target.value)
                      }
                      className="w-full rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-200"
                    >
                      <option value="">
                        Select machine
                      </option>

                      {machines.map((machine) => (
                        <option
                          key={machine.id}
                          value={machine.id}
                        >
                          {machine.id} - {machine.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="font-bold text-slate-900">
                      {machineId || "Not identified"}
                    </span>
                  )}
                </div>

                {/* INCIDENT TYPE */}
                <div className="grid grid-cols-[145px_1fr] items-center gap-3">
                  <div className="flex items-center gap-2 text-sm text-slate-500">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                    Incident
                  </div>

                  {editing ? (
                    <input
                      value={incidentType}
                      onChange={(event) =>
                        setIncidentType(event.target.value)
                      }
                      className="w-full rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-200"
                    />
                  ) : (
                    <span className="font-bold text-slate-900">
                      {capitalize(
                        incidentType.replaceAll("_", " ")
                      )}
                    </span>
                  )}
                </div>

                {/* LOCATION */}
                <div className="grid grid-cols-[145px_1fr] items-center gap-3">
                  <div className="flex items-center gap-2 text-sm text-slate-500">
                    <MapPin className="h-4 w-4 text-violet-600" />
                    Location
                  </div>

                  {editing ? (
                    <input
                      value={location}
                      onChange={(event) =>
                        setLocation(event.target.value)
                      }
                      className="w-full rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-200"
                    />
                  ) : (
                    <span className="font-bold text-slate-900">
                      {location ||
                        selectedMachine?.location ||
                        "Not identified"}
                    </span>
                  )}
                </div>

                {/* SEVERITY */}
                <div className="grid grid-cols-[145px_1fr] items-center gap-3">
                  <div className="flex items-center gap-2 text-sm text-slate-500">
                    <ShieldCheck className="h-4 w-4 text-violet-600" />
                    Severity
                  </div>

                  {editing ? (
                    <select
                      value={severity}
                      onChange={(event) =>
                        setSeverity(
                          event.target.value as Severity
                        )
                      }
                      className="w-full rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-200"
                    >
                      {(
                        ["low", "medium", "high", "critical"] as Severity[]
                      ).map((item) => (
                        <option key={item} value={item}>
                          {capitalize(item)}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span
                      className={`inline-flex w-fit items-center rounded-full border px-3 py-1 text-xs font-bold ${severityStyles[severity]}`}
                    >
                      {capitalize(severity)}
                    </span>
                  )}
                </div>

                {/* SYMPTOMS */}
                <div className="border-t border-slate-100 pt-4">
                  <p className="mb-2 text-xs font-semibold text-slate-500">
                    Reported Symptoms
                  </p>

                  {editing ? (
                    <textarea
                      rows={3}
                      value={symptoms}
                      onChange={(event) =>
                        setSymptoms(event.target.value)
                      }
                      className="w-full resize-none rounded-lg border border-violet-200 bg-white p-3 text-sm outline-none focus:ring-2 focus:ring-violet-200"
                    />
                  ) : (
                    <p className="text-sm leading-6 text-slate-700">
                      {symptoms || "No symptoms extracted."}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* RIGHT: ORIGINAL REPORT */}
            <div className="rounded-2xl border border-violet-100 bg-gradient-to-br from-[#faf8ff] to-[#f4efff] p-5 sm:p-6">

              <div className="mb-6 flex items-center gap-3">
                <div className="rounded-xl bg-violet-100 p-2.5">
                  {isTyped ? (
                    <Keyboard className="h-5 w-5 text-violet-700" />
                  ) : (
                    <AudioLines className="h-5 w-5 text-violet-700" />
                  )}
                </div>

                <div>
                  <h2 className="font-bold text-slate-900">
                    {reportTitle}
                  </h2>

                  <p className="text-xs text-slate-400">
                    {isTyped
                      ? "Entered manually"
                      : "Transcribed by Gnani Prisma"}
                  </p>
                </div>
              </div>

              {/* AUDIO WAVEFORM ONLY */}
              {!isTyped && (
                <div className="mb-5 flex h-16 items-center gap-1 overflow-hidden rounded-xl border border-violet-100 bg-white/80 px-4">
                  {Array.from({ length: 40 }, (_, index) => (
                    <span
                      key={index}
                      className="w-1 flex-1 rounded-full bg-violet-500"
                      style={{
                        height: `${15 + ((index * 17) % 35)}px`,
                        opacity: 0.45 + (index % 5) * 0.1,
                      }}
                    />
                  ))}
                </div>
              )}

              <p className="mb-3 text-xs text-slate-400">
                {isTyped ? "Your report" : "Voice transcription"}
              </p>

              <div className="rounded-xl border border-violet-100 bg-white/80 p-4">
                <p className="text-sm font-medium leading-7 text-slate-800">
                  &quot;{analysis.transcript}&quot;
                </p>
              </div>

              {/* LANGUAGE AND EXTRACTOR */}
              <div className="mt-5 flex flex-wrap gap-2">
                <span className="rounded-lg bg-white px-3 py-2 text-xs font-medium text-slate-600">
                  Language:{" "}
                  {capitalize(extraction.language || "Unknown")}
                </span>

                <span className="rounded-lg bg-white px-3 py-2 text-xs font-medium text-slate-600">
                  Extractor: {analysis.extractor}
                </span>
              </div>

              {/* EXTRACTION CONFIDENCE */}
              {extraction.extraction_confidence != null && (
                <p className="mt-4 text-xs text-slate-400">
                  AI-reported extraction confidence:{" "}
                  {Math.round(
                    extraction.extraction_confidence * 100
                  )}%
                </p>
              )}
            </div>
          </div>

          {/* ERROR */}
          {error && (
            <div
              role="alert"
              className="mt-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"
            >
              {error}
            </div>
          )}

          {/* ACTION BUTTONS */}
          <div className="mt-6 flex flex-col-reverse justify-center gap-3 sm:flex-row">

            <Button
              variant="outline"
              onClick={() => {
                if (editing) {
                  setEditing(false);
                } else {
                  onBack();
                }
              }}
              disabled={creating}
              className="rounded-xl border-slate-200 bg-white px-8 py-5 font-semibold text-slate-700 hover:bg-slate-50"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              {editing ? "Cancel" : "Back"}
            </Button>

            <Button
              variant="outline"
              onClick={() => {
                setEditing(!editing);
                setError(null);
              }}
              disabled={creating}
              className="rounded-xl border-violet-200 bg-white px-8 py-5 font-semibold text-violet-700 hover:bg-violet-50"
            >
              <Pencil className="mr-2 h-4 w-4" />
              {editing ? "Done Editing" : "Edit"}
            </Button>

            <Button
              onClick={createIncident}
              disabled={
                creating ||
                editing ||
                !incidentType.trim() ||
                machineMissing
              }
              className="rounded-xl bg-violet-600 px-8 py-5 font-semibold text-white shadow-lg shadow-violet-200 hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {creating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating Incident...
                </>
              ) : (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  Confirm &amp; Create Incident
                </>
              )}
            </Button>
          </div>

          <p className="mt-4 text-center text-[11px] text-slate-400">
            Please verify the extracted details before creating the incident.
          </p>

        </CardContent>
      </Card>
    </div>
  );
}