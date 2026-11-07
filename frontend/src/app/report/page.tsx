"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Pencil } from "lucide-react";
import { api, type Machine, type NewIncident, type Severity, type Transcription } from "@/lib/api";
import { capitalize, formatConfidence, INCIDENT_TYPES, SEVERITIES } from "@/lib/format";
import { SeverityBadge } from "@/components/badges";
import { VoiceRecorder } from "@/components/voice-recorder";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

const LANGUAGES = ["hindi", "english", "hinglish"];
const fieldClass = "w-full rounded-md border bg-white px-3 py-2 text-sm";

// Two steps on one page: "report" (speak or type) -> "confirm" (worker checks what we understood).
export default function ReportPage() {
  const router = useRouter();
  const [step, setStep] = useState<"report" | "confirm">("report");
  const [language, setLanguage] = useState("hinglish");
  const [text, setText] = useState("");
  const [draft, setDraft] = useState<NewIncident | null>(null);
  const [extractor, setExtractor] = useState("");
  const [machines, setMachines] = useState<Machine[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [voice, setVoice] = useState<Transcription | null>(null);
  const [transcribing, setTranscribing] = useState(false);

  useEffect(() => {
    api.machines().then(setMachines).catch((e) => setError(String(e)));
  }, []);

  // Recording or uploaded file -> backend (ffmpeg + Prisma) -> transcript shown for the worker to check.
  async function onAudio(audio: Blob, filename: string) {
    setTranscribing(true);
    setError(null);
    setVoice(null);
    try {
      setVoice(await api.transcribe(audio, filename));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setTranscribing(false);
    }
  }

  // Transcript (spoken or typed) -> extract -> Confirm Details screen.
  async function understand(text: string) {
    setBusy(true);
    setError(null);
    try {
      const result = await api.extract(text);
      setDraft({
        machine_id: result.machine_id,
        incident_type: result.incident_type,
        severity: result.severity,
        symptoms: result.symptoms,
        transcript: text,
        language: result.language,
      });
      setExtractor(result.extractor);
      setStep("confirm");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      const created = await api.createIncident(draft);
      router.push(`/incidents/${created.id}`);
    } catch (e) {
      setError(String(e));
      setBusy(false);
    }
  }

  if (step === "confirm" && draft) {
    const update = (changes: Partial<NewIncident>) => setDraft({ ...draft, ...changes });
    const location = machines.find((m) => m.id === draft.machine_id)?.location ?? "—";

    return (
      <div className="max-w-4xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Confirm Details</h1>
          <p className="text-sm text-slate-500">We&apos;ve understood your report like this. Please check and fix anything wrong.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-[1fr_1fr]">
          <Card>
            <CardContent className="space-y-4">
              <label className="block space-y-1 text-sm">
                <span className="text-slate-500">Machine ID</span>
                <select
                  className={fieldClass}
                  value={draft.machine_id ?? ""}
                  onChange={(e) => update({ machine_id: e.target.value || null })}
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
                <select
                  className={fieldClass}
                  value={draft.incident_type}
                  onChange={(e) => update({ incident_type: e.target.value })}
                >
                  {Object.entries(INCIDENT_TYPES).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1 text-sm">
                <span className="flex items-center gap-2 text-slate-500">
                  Severity <SeverityBadge severity={draft.severity} />
                </span>
                <select
                  className={fieldClass}
                  value={draft.severity}
                  onChange={(e) => update({ severity: e.target.value as Severity })}
                >
                  {SEVERITIES.map((s) => (
                    <option key={s} value={s}>
                      {capitalize(s)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1 text-sm">
                <span className="text-slate-500">Symptoms (comma separated)</span>
                <input
                  className={fieldClass}
                  value={draft.symptoms.join(", ")}
                  onChange={(e) =>
                    update({ symptoms: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })
                  }
                />
              </label>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-4">
              <label className="block space-y-1 text-sm">
                <span className="text-slate-500">Transcription</span>
                <Textarea
                  rows={4}
                  value={draft.transcript}
                  onChange={(e) => update({ transcript: e.target.value })}
                />
              </label>
              <label className="block space-y-1 text-sm">
                <span className="text-slate-500">Language</span>
                <select
                  className={fieldClass}
                  value={draft.language ?? ""}
                  onChange={(e) => update({ language: e.target.value })}
                >
                  {LANGUAGES.map((l) => (
                    <option key={l} value={l}>
                      {capitalize(l)}
                    </option>
                  ))}
                </select>
              </label>
              <p className="text-sm">
                <span className="text-slate-500">Confidence: </span>
                <span className="font-medium">{formatConfidence(null)}</span>
              </p>
              <p className="text-xs text-slate-400">Extracted by: {extractor}</p>
            </CardContent>
          </Card>
        </div>

        {error && <p className="text-sm text-red-700">{error}</p>}

        <div className="flex justify-center gap-3">
          <Button variant="outline" onClick={() => setStep("report")} disabled={busy}>
            <Pencil /> Edit report
          </Button>
          <Button onClick={confirm} disabled={busy}>
            <Check /> Confirm &amp; Create Incident
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Report an Incident</h1>
        <p className="text-sm text-slate-500">Speak naturally in Hindi, English or Hinglish about the issue.</p>
      </div>

      <div className="flex flex-col items-center gap-3">
        <VoiceRecorder disabled={transcribing || busy} onAudio={onAudio} />

        <div className="mt-2 flex gap-2">
          {LANGUAGES.map((l) => (
            <button
              key={l}
              onClick={() => setLanguage(l)}
              className={`rounded-lg border px-4 py-1.5 text-sm ${
                language === l ? "border-[#6d4ae8] bg-violet-100 text-[#6d4ae8]" : "bg-white"
              }`}
            >
              {capitalize(l)}
            </button>
          ))}
        </div>
      </div>

      {transcribing && (
        <p className="text-center text-sm text-slate-500">Transcribing with Prisma v3.0…</p>
      )}

      {voice && (
        <Card className="border-violet-200">
          <CardContent className="space-y-3">
            <p className="text-sm font-medium">What we heard</p>
            <p className="rounded-md bg-violet-50 p-3 text-lg">
              {voice.transcript ? `“${voice.transcript}”` : "No speech detected — please try again."}
            </p>
            <p className="text-xs text-slate-500">
              Prisma v3.0 · language: {voice.detected_language_code ?? "—"} · {voice.audio_seconds} s audio ·
              transcribed in {voice.stt_ms} ms{voice.cached ? " (cached result, no new call)" : ""}
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setVoice(null)} disabled={busy}>
                Discard
              </Button>
              <Button onClick={() => understand(voice.transcript)} disabled={busy || !voice.transcript}>
                {busy ? "Understanding…" : "Continue"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {error && <p className="text-center text-sm text-red-700">{error}</p>}

      <Card>
        <CardContent className="space-y-3">
          <p className="text-sm font-medium">Type report instead</p>
          <Textarea
            rows={3}
            placeholder='e.g. "Machine 14 mein smoke aa raha hai"'
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="flex justify-end">
            <Button onClick={() => understand(text)} disabled={busy || !text.trim()}>
              {busy ? "Understanding…" : "Continue"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
