"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, HelpCircle, Pencil, ShieldAlert } from "lucide-react";
import { api, type Analysis, type IncidentDetail, type Machine, type Severity } from "@/lib/api";
import { capitalize, DECIDED_BY, formatConfidence, INCIDENT_TYPES, SEVERITIES } from "@/lib/format";
import { say } from "@/lib/voice";
import { SeverityBadge } from "@/components/badges";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const fieldClass = "w-full rounded-md border bg-white px-3 py-2 text-sm";
const LANGUAGES = ["hindi", "english", "hinglish"];

const spoken = (id: string) => `Machine ${Number(id.split("-")[1])}`; // "M-14" -> "Machine 14"

type Props = {
  analysis: Analysis;
  machines: Machine[];
  onBack: () => void;
  onCreated: (incident: IncidentDetail) => void;
};

// The worker checks what the AI understood before anything is saved.
export function ConfirmDetails({ analysis, machines, onBack, onCreated }: Props) {
  const ex = analysis.extraction;
  const [machineId, setMachineId] = useState<string | null>(ex.machine_id);
  const [incidentType, setIncidentType] = useState(ex.incident_type);
  const [severity, setSeverity] = useState<Severity>(analysis.severity);
  const [symptoms, setSymptoms] = useState(ex.reported_symptoms.join(", "));
  const [language, setLanguage] = useState(ex.language);
  // If the AI is unsure about the machine, the worker must answer before saving.
  const [machineConfirmed, setMachineConfirmed] = useState(!ex.confirmation_required);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const machineSelect = useRef<HTMLSelectElement>(null);

  // Speak the confirmation question once when this screen opens (text is on screen regardless).
  const question = ex.confirmation_required ? ex.confirmation_question : null;
  useEffect(() => {
    if (question) say(question);
  }, [question]);

  const ruleLocked = analysis.rule_hits.length > 0; // a safety rule fired -> Critical, cannot be lowered
  const location = machines.find((m) => m.id === machineId)?.location ?? ex.location ?? "—";

  function chooseMachine(id: string | null) {
    setMachineId(id);
    setMachineConfirmed(true);
  }

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const incident = await api.createIncident({
        machine_id: machineId,
        incident_type: incidentType,
        severity,
        symptoms: symptoms.split(",").map((s) => s.trim()).filter(Boolean),
        transcript: analysis.transcript, // always the RAW transcript — the server re-runs the safety rules on it
        language,
        analysis,
      });
      onCreated(incident);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <div className="max-w-4xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Confirm Details</h1>
        <p className="text-sm text-slate-500">We&apos;ve understood your report like this. Please check it.</p>
      </div>

      <Card>
        <CardContent className="space-y-1">
          <p className="text-xs text-slate-500">What you said (raw transcript)</p>
          <p className="text-lg">“{analysis.transcript}”</p>
        </CardContent>
      </Card>

      {ruleLocked && (
        <div className="flex gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">
          <ShieldAlert className="mt-0.5 size-5 shrink-0" />
          <div className="text-sm">
            <p className="font-semibold">Safety rule triggered → Critical (simulated alert will be raised)</p>
            {analysis.rule_hits.map((h) => (
              <p key={h.rule_id}>
                Rule {h.rule_id} ({h.rule_name}): “{h.keyword}” found in {h.source}
              </p>
            ))}
            <p className="text-xs text-red-700">Fixed safety rules cannot be lowered by the AI or on this screen.</p>
          </div>
        </div>
      )}

      {analysis.fallback_reason && (
        <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          {analysis.fallback_reason}
        </div>
      )}

      {ex.confirmation_required && !machineConfirmed && (
        <div className="rounded-xl border-2 border-amber-400 bg-amber-50 p-4">
          <p className="flex items-center gap-2 font-semibold text-amber-900">
            <HelpCircle className="size-5" />
            {ex.confirmation_question ?? "Kaunsi machine? Machine ka number batayiye."}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {ex.machine_candidates.map((id) => (
              <Button key={id} onClick={() => chooseMachine(id)}>
                {spoken(id)} — {machines.find((m) => m.id === id)?.name}
              </Button>
            ))}
            <Button variant="outline" onClick={() => machineSelect.current?.focus()}>
              <Pencil /> Choose another machine
            </Button>
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="space-y-4">
            <label className="block space-y-1 text-sm">
              <span className="text-slate-500">Machine ID</span>
              <select
                ref={machineSelect}
                className={`${fieldClass} ${!machineConfirmed ? "border-amber-400 ring-2 ring-amber-300" : ""}`}
                value={machineId ?? ""}
                onChange={(e) => chooseMachine(e.target.value || null)}
              >
                <option value="">Unknown machine</option>
                {machines.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.id} — {m.name}
                  </option>
                ))}
              </select>
            </label>
            <p className="text-sm">
              <span className="text-slate-500">Location: </span>
              <span className="font-medium">{location}</span>
            </p>
            <label className="block space-y-1 text-sm">
              <span className="text-slate-500">Incident</span>
              <select className={fieldClass} value={incidentType} onChange={(e) => setIncidentType(e.target.value)}>
                {Object.entries(INCIDENT_TYPES).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1 text-sm">
              <span className="text-slate-500">Symptoms (comma separated)</span>
              <input className={fieldClass} value={symptoms} onChange={(e) => setSymptoms(e.target.value)} />
            </label>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4">
            <label className="block space-y-1 text-sm">
              <span className="flex items-center gap-2 text-slate-500">
                Severity <SeverityBadge severity={severity} />
              </span>
              <select
                className={fieldClass}
                value={severity}
                disabled={ruleLocked}
                onChange={(e) => setSeverity(e.target.value as Severity)}
              >
                {SEVERITIES.map((s) => (
                  <option key={s} value={s}>
                    {capitalize(s)}
                  </option>
                ))}
              </select>
              <span className="text-xs text-slate-500">
                Decided by: {DECIDED_BY[analysis.severity_decided_by] ?? analysis.severity_decided_by}
                {ex.suggested_severity && ` · AI suggested ${ex.suggested_severity}`}
              </span>
            </label>
            <label className="block space-y-1 text-sm">
              <span className="text-slate-500">Language</span>
              <select className={fieldClass} value={language} onChange={(e) => setLanguage(e.target.value)}>
                {LANGUAGES.map((l) => (
                  <option key={l} value={l}>
                    {capitalize(l)}
                  </option>
                ))}
              </select>
            </label>
            <p className="text-sm">
              <span className="text-slate-500">Model confidence (self-reported): </span>
              <span className="font-medium">{formatConfidence(ex.extraction_confidence)}</span>
            </p>
            <p className="text-xs text-slate-400">
              Extracted by: {analysis.extractor}
              {analysis.llm_ms != null && ` · LLM ${analysis.llm_ms} ms`}
            </p>
          </CardContent>
        </Card>
      </div>

      {error && <p className="text-sm text-red-700">{error}</p>}

      <div className="flex justify-center gap-3">
        <Button variant="outline" onClick={onBack} disabled={busy}>
          <Pencil /> Edit report
        </Button>
        <Button onClick={create} disabled={busy || !machineConfirmed}>
          <Check /> Confirm &amp; Create Incident
        </Button>
      </div>
      {!machineConfirmed && <p className="text-center text-xs text-amber-700">Answer the machine question first.</p>}
    </div>
  );
}
