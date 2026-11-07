"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, type Analysis, type Machine, type Transcription } from "@/lib/api";
import { capitalize } from "@/lib/format";
import { ConfirmDetails } from "@/components/confirm-details";
import { VoiceRecorder } from "@/components/voice-recorder";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

// Chip -> Prisma language_code (done in the backend): Hindi hi-IN, English en-IN, Hinglish hi-IN,en-IN.
const LANGUAGES = ["hindi", "english", "hinglish"];

// Two steps on one page: "report" (speak or type) -> "confirm" (worker checks what we understood).
export default function ReportPage() {
  const router = useRouter();
  const [language, setLanguage] = useState("hinglish");
  const [text, setText] = useState("");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
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
      setVoice(await api.transcribe(audio, filename, language));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setTranscribing(false);
    }
  }

  // Transcript (spoken or typed) -> LLM extraction + safety rules -> Confirm Details screen.
  async function understand(transcript: string) {
    setBusy(true);
    setError(null);
    try {
      setAnalysis(await api.extract(transcript));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (analysis) {
    return (
      <ConfirmDetails
        analysis={analysis}
        machines={machines}
        onBack={() => setAnalysis(null)}
        onCreated={(incident) => router.push(`/incidents/${incident.id}`)}
      />
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

        <div className="mt-2 flex gap-2" role="radiogroup" aria-label="Speaking language">
          {LANGUAGES.map((l) => (
            <button
              key={l}
              role="radio"
              aria-checked={language === l}
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

      {transcribing && <p className="text-center text-sm text-slate-500">Transcribing with Prisma v3.0…</p>}

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
            placeholder='e.g. "Machine 14 mein dhuan aa raha hai"'
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
