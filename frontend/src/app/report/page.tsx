"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  ShieldCheck,
  AudioLines,
  Keyboard,
  Sparkles,
  AlertCircle,
  Loader2,
} from "lucide-react";

import {
  api,
  type Analysis,
  type Machine,
  type Transcription,
} from "@/lib/api";

import { capitalize } from "@/lib/format";
import { play } from "@/lib/voice";
import { ConfirmDetails } from "@/components/confirm-details";
import {
  VoiceRecorder,
  type AudioSource,
} from "@/components/voice-recorder";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

const LANGUAGES = ["hindi", "english", "hinglish"];

type ReportSource = "voice" | "upload" | "typed";

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

  const [source, setSource] = useState<ReportSource>("typed");
  const [audioSource, setAudioSource] = useState<AudioSource>("voice");

  // Load available machines.
  useEffect(() => {
    let active = true;

    api.machines()
      .then((result) => {
        if (active) {
          setMachines(result);
        }
      })
      .catch((e) => {
        if (active) {
          setError(e instanceof Error ? e.message : String(e));
        }
      });

    return () => {
      active = false;
    };
  }, []);

  // Audio recording/upload -> Gnani Prisma transcription.
  async function onAudio(
    audio: Blob,
    filename: string,
    reportSource: AudioSource
  ) {
    if (transcribing || busy) return;

    setTranscribing(true);
    setError(null);
    setVoice(null);

    setAudioSource(reportSource);

    try {
      const result = await api.transcribe(
        audio,
        filename,
        language
      );

      if (!result.transcript?.trim()) {
        setError(
          "No speech was detected. Please record again or try another audio file."
        );
        return;
      }

      setVoice(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setTranscribing(false);
    }
  }

  // Transcript -> AI extraction and deterministic safety rules.
  async function understand(
    transcript: string,
    reportSource: ReportSource
  ) {
    const cleanedTranscript = transcript.trim();

    if (!cleanedTranscript) {
      setError("Please enter or record an incident report first.");
      return;
    }

    if (busy || transcribing) return;

    setBusy(true);
    setError(null);

    try {
      const result = await api.extract(cleanedTranscript);

      setSource(reportSource);
      setAnalysis(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  // Confirmation screen.
  if (analysis) {
    return (
      <ConfirmDetails
        analysis={analysis}
        machines={machines}
        source={source}
        onBack={() => setAnalysis(null)}
        onCreated={(incident) => {
          api.announce(incident.id)
            .then(play)
            .catch(() => {});

          router.push(`/incidents/${incident.id}`);
        }}
      />
    );
  }

  return (
    <div className="mx-auto w-full min-w-0 max-w-6xl space-y-5 sm:space-y-6">

      {/* PAGE HEADER */}
      <header className="min-w-0">

        <div className="mb-3 flex flex-wrap items-center gap-2">

          <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold tracking-wide text-violet-700">
            VOICE-FIRST REPORTING
          </span>

          <span className="flex items-center gap-1 text-xs font-medium text-emerald-600">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            System ready
          </span>

        </div>

        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
          Report an Incident
        </h1>

        <p className="mt-2 max-w-3xl text-sm font-medium leading-relaxed text-slate-600">
          Speak naturally in Hindi, English or Hinglish about an issue on the
          factory floor.
        </p>

      </header>

      {/* VOICE REPORTING CARD */}
      <Card className="relative isolate min-w-0 overflow-hidden rounded-2xl border border-violet-100 bg-[#faf9ff] shadow-sm sm:rounded-3xl">

        {/* FACTORY BACKGROUND */}
        <div className="pointer-events-none absolute inset-0">

          <div className="absolute right-0 top-0 h-full w-full sm:w-[70%]">

            <Image
              src="/factory.png"
              alt="Industrial factory"
              fill
              priority
              sizes="(max-width: 640px) 100vw, 70vw"
              className="object-cover object-center opacity-20 blur-[2px] sm:opacity-25"
            />

          </div>

          <div className="absolute inset-0 bg-gradient-to-r from-[#faf9ff] via-[#faf9ff]/90 to-white/40" />

          <div className="absolute inset-0 bg-gradient-to-b from-white/30 via-transparent to-[#f7f4ff]/80" />

        </div>

        {/* MAIN CONTENT */}
        <CardContent className="relative z-10 flex min-w-0 flex-col items-center px-3 py-7 text-center sm:px-8 sm:py-10 md:px-10">

          <h2 className="text-xl font-extrabold tracking-tight text-slate-900 sm:text-2xl">
            Tell us what happened
          </h2>

          <p className="mt-2 max-w-md text-xs leading-relaxed text-slate-600 sm:text-sm">
            Record your incident or upload an existing audio report.
          </p>

          {/* MICROPHONE RECORDER */}
          <div className="mt-5 flex w-full min-w-0 justify-center sm:mt-6">

            <VoiceRecorder
              disabled={transcribing || busy}
              statusText={
                transcribing
                  ? "Transcribing your recording..."
                  : busy
                    ? "Understanding your report..."
                    : undefined
              }
              onAudio={onAudio}
            />

          </div>

          {/* LANGUAGE SELECTOR */}
          <div className="mt-6 w-full max-w-md">

            <p className="mb-3 text-sm font-semibold text-slate-700">
              Select your speaking language
            </p>

            <div className="grid grid-cols-3 gap-2 sm:gap-3">

              {LANGUAGES.map((item) => (

                <button
                  key={item}
                  type="button"
                  aria-pressed={language === item}
                  disabled={transcribing || busy}
                  onClick={() => setLanguage(item)}
                  className={`min-w-0 rounded-xl border px-2 py-3 text-xs font-bold transition-all disabled:cursor-not-allowed disabled:opacity-60 sm:px-3 sm:text-sm ${
                    language === item
                      ? "border-violet-400 bg-violet-100/90 text-violet-700 shadow-sm"
                      : "border-slate-200 bg-white/90 text-slate-600 hover:border-violet-300 hover:bg-violet-50"
                  }`}
                >
                  {capitalize(item)}
                </button>

              ))}

            </div>

          </div>

          {/* FEATURES */}
          <div className="mt-6 flex flex-wrap justify-center gap-x-5 gap-y-3 text-xs font-medium text-slate-600 sm:mt-7 sm:gap-6">

            <span className="flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-500" />
              Safety-first detection
            </span>

            <span className="flex items-center gap-1.5">
              <AudioLines className="h-4 w-4 shrink-0 text-violet-500" />
              Gnani Prisma v3.0
            </span>

          </div>

        </CardContent>

      </Card>

      {/* TRANSCRIPTION LOADING */}
      {transcribing && (
        <Card
          aria-label="Transcribing"
          className="min-w-0 rounded-2xl border-violet-200 bg-white"
        >
          <CardContent className="space-y-3 p-4 sm:p-5">

            <div className="flex items-center gap-2">

              <Loader2 className="h-5 w-5 shrink-0 animate-spin text-violet-600" />

              <p className="text-sm font-semibold text-slate-800">
                Processing your voice report
              </p>

            </div>

            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-3 w-2/3" />

          </CardContent>
        </Card>
      )}

      {/* TRANSCRIPTION RESULT */}
      {voice && (
        <Card className="min-w-0 rounded-2xl border-violet-200 bg-white shadow-sm">

          <CardContent className="min-w-0 space-y-4 p-4 sm:p-5">

            <div className="flex items-center gap-3">

              <div className="shrink-0 rounded-xl bg-violet-100 p-2.5">
                <AudioLines className="h-5 w-5 text-violet-700" />
              </div>

              <div className="min-w-0">
                <h3 className="font-bold text-slate-900">
                  What we heard
                </h3>

                <p className="text-xs text-slate-500">
                  Review your transcription before continuing.
                </p>
              </div>

            </div>

            <div className="min-w-0 rounded-xl border border-violet-100 bg-violet-50 p-3 sm:p-4">

              <p className="break-words text-sm leading-7 text-slate-800 sm:text-base">
                &ldquo;{voice.transcript}&rdquo;
              </p>

            </div>

            <div className="flex flex-wrap gap-2 text-xs text-slate-500">

              <span className="rounded-lg bg-slate-100 px-3 py-2">
                Prisma v3.0
              </span>

              <span className="rounded-lg bg-slate-100 px-3 py-2">
                {voice.detected_language_code ?? "—"}
              </span>

              <span className="rounded-lg bg-slate-100 px-3 py-2">
                {voice.audio_seconds}s audio
              </span>

              <span className="rounded-lg bg-slate-100 px-3 py-2">
                {voice.stt_ms} ms
              </span>

            </div>

            {voice.cached && (
              <p className="text-xs text-slate-400">
                Cached result — no new API call was made.
              </p>
            )}

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">

              <Button
                variant="outline"
                onClick={() => setVoice(null)}
                disabled={busy}
                className="w-full sm:w-auto"
              >
                Discard
              </Button>

              <Button
                onClick={() =>
                  understand(voice.transcript, audioSource)
                }
                disabled={
                  busy ||
                  transcribing ||
                  !voice.transcript?.trim()
                }
                className="w-full bg-violet-600 text-white hover:bg-violet-700 sm:w-auto"
              >
                {busy ? "Understanding..." : "Continue"}
              </Button>

            </div>

          </CardContent>
        </Card>
      )}

      {/* ERROR MESSAGE */}
      {error && (
        <div
          role="alert"
          className="flex min-w-0 items-start gap-3 break-words rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 sm:p-4"
        >
          <AlertCircle className="h-5 w-5 shrink-0" />
          <p className="min-w-0">{error}</p>
        </div>
      )}

      {/* DIVIDER */}
      <div className="flex items-center gap-4">

        <div className="h-px flex-1 bg-violet-200" />

        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          OR
        </span>

        <div className="h-px flex-1 bg-violet-200" />

      </div>

      {/* TEXT REPORT */}
      <Card className="min-w-0 rounded-2xl border border-violet-100 bg-white shadow-sm">

        <CardContent className="min-w-0 space-y-4 p-4 sm:p-6">

          <div className="flex items-center gap-3">

            <div className="shrink-0 rounded-xl bg-violet-100 p-2.5">
              <Keyboard className="h-5 w-5 text-violet-700" />
            </div>

            <div className="min-w-0">

              <h3 className="font-bold text-slate-900">
                Type your report instead
              </h3>

              <p className="text-xs text-slate-500">
                Describe the issue using text.
              </p>

            </div>

          </div>

          <Textarea
            rows={4}
            placeholder='Example: "Machine 14 mein smoke aa raha hai..."'
            value={text}
            onChange={(event) => setText(event.target.value)}
            disabled={busy || transcribing}
            className="min-w-0 resize-none rounded-xl border-slate-200 bg-slate-50 p-3 text-sm sm:p-4"
          />

          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">

            <p className="text-xs leading-relaxed text-slate-400">
              Include the machine number and symptoms if known.
            </p>

            <Button
              onClick={() => understand(text, "typed")}
              disabled={busy || transcribing || !text.trim()}
              className="w-full rounded-xl bg-violet-600 px-6 text-white hover:bg-violet-700 sm:w-auto"
            >

              {busy ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Understanding...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Understand Report
                </>
              )}

            </Button>

          </div>

        </CardContent>
      </Card>

      {/* SAFETY NOTE */}
      <div className="flex min-w-0 items-start gap-3 rounded-xl border border-blue-100 bg-blue-50 p-3 sm:p-4">

        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />

        <p className="text-xs leading-6 text-blue-800">
          KAIZER uses safety rules to identify critical incidents.
          Always follow your factory&apos;s official emergency procedures.
          Review AI-generated incident details before submission.
        </p>

      </div>

    </div>
  );
}