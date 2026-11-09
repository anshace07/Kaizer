"use client";

import { useCallback, useState } from "react";

import {
  AudioLines,
  AlertCircle,
  Clock3,
  ClipboardList,
  Loader2,
  Play,
  RefreshCw,
  Volume2,
} from "lucide-react";

import {
  api,
  type Incident,
  type Severity,
} from "@/lib/api";

import { currentShift, capitalize, typeLabel } from "@/lib/format";
import { useAutoRefresh } from "@/lib/use-auto-refresh";
import { play } from "@/lib/voice";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const severityStyles: Record<Severity, string> = {
  critical: "bg-red-100 text-red-700 border-red-200",
  high: "bg-orange-100 text-orange-700 border-orange-200",
  medium: "bg-amber-100 text-amber-700 border-amber-200",
  low: "bg-emerald-100 text-emerald-700 border-emerald-200",
};

const waveformHeights = [
  12, 20, 30, 18, 38, 25, 45, 32, 20, 40,
  52, 28, 18, 42, 30, 50, 36, 22, 44, 32,
  18, 38, 48, 26, 16, 34, 44, 24, 14, 30,
  42, 22, 12, 28, 38, 18, 10, 24, 32, 16,
];

function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-[10px] font-semibold sm:px-3 sm:text-xs ${severityStyles[severity]}`}
    >
      {capitalize(severity)}
    </span>
  );
}

export default function HandoverPage() {
  const [summary, setSummary] = useState<any>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);

  // Fetch unresolved incidents and refresh every five seconds.
  const loadOpen = useCallback(async () => {
    const incidents = await api.incidents();

    return incidents
      .filter((incident) => incident.status !== "resolved")
      .sort((a, b) => {
        const rank: Record<Severity, number> = {
          critical: 0,
          high: 1,
          medium: 2,
          low: 3,
        };

        return rank[a.severity] - rank[b.severity];
      });
  }, []);

  const {
    data: incidents,
    error: incidentsError,
  } = useAutoRefresh(loadOpen, 5000);

  const now = new Date();

  const criticalCount =
    incidents?.filter((i) => i.severity === "critical").length ?? 0;

  const highCount =
    incidents?.filter((i) => i.severity === "high").length ?? 0;

  async function generateSummary() {
    setSummaryLoading(true);
    setSummaryError(null);

    try {
      const result = await api.handoverSummary();
      setSummary(result);
    } catch (e) {
      setSummaryError(
        e instanceof Error ? e.message : String(e)
      );
    } finally {
      setSummaryLoading(false);
    }
  }

  async function playSummary() {
    if (!summary) return;

    if (!summary.audio_url) {
      setSummaryError(
        "Audio is unavailable. Please generate the summary again."
      );
      return;
    }

    setPlaying(true);

    try {
      await play(summary);
    } catch (e) {
      setSummaryError(
        e instanceof Error ? e.message : "Unable to play the audio."
      );
    } finally {
      setPlaying(false);
    }
  }

  return (
    <div className="min-h-full min-w-0 space-y-5 sm:space-y-7">

      {/* HEADER */}
      <header className="min-w-0">

        <div className="mb-3 flex flex-wrap items-center gap-2">

          <span className="inline-flex items-center gap-2 rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-700">
            SHIFT MANAGEMENT
          </span>

          <span className="flex items-center gap-1 text-xs font-medium text-emerald-600">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            Live updates
          </span>

        </div>

        <div className="flex min-w-0 flex-col justify-between gap-4 sm:flex-row sm:items-center">

          <div className="min-w-0">

            <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              Shift Handover Summary
            </h1>

            <p className="mt-2 text-sm text-slate-500">
              A quick voice summary of open and important incidents for the next shift.
            </p>

          </div>

          <div className="flex w-full shrink-0 items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm sm:w-auto">

            <div className="shrink-0 rounded-xl bg-violet-100 p-2.5">
              <Clock3 className="h-5 w-5 text-violet-700" />
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Current Shift
              </p>

              <p className="text-sm font-bold text-slate-900">
                {currentShift(now)}
              </p>
            </div>

          </div>

        </div>

      </header>

      {/* ERRORS */}
      {incidentsError && (
        <div className="flex min-w-0 items-start gap-2 break-words rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 sm:p-4">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          Unable to load incidents: {incidentsError}
        </div>
      )}

      {/* SUMMARY CARDS */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">

        <Card className="rounded-2xl border border-slate-100 bg-white shadow-sm">
          <CardContent className="p-4 sm:p-5">

            <p className="text-sm font-semibold text-slate-600">
              Open Incidents
            </p>

            <p className="mt-2 text-3xl font-bold text-slate-900">
              {incidents ? incidents.length : "—"}
            </p>

            <p className="mt-1 text-xs text-slate-500">
              Requiring attention
            </p>

          </CardContent>
        </Card>

        <Card className="rounded-2xl border border-red-100 bg-red-50 shadow-sm">
          <CardContent className="p-4 sm:p-5">

            <p className="text-sm font-semibold text-red-700">
              Critical
            </p>

            <p className="mt-2 text-3xl font-bold text-red-700">
              {incidents ? criticalCount : "—"}
            </p>

            <p className="mt-1 text-xs text-red-600">
              Critical incidents
            </p>

          </CardContent>
        </Card>

        <Card className="rounded-2xl border border-orange-100 bg-orange-50 shadow-sm">
          <CardContent className="p-4 sm:p-5">

            <p className="text-sm font-semibold text-orange-700">
              High Priority
            </p>

            <p className="mt-2 text-3xl font-bold text-orange-700">
              {incidents ? highCount : "—"}
            </p>

            <p className="mt-1 text-xs text-orange-600">
              High priority incidents
            </p>

          </CardContent>
        </Card>

      </section>

      {/* MAIN LAYOUT */}
      <div className="grid min-w-0 grid-cols-1 items-stretch gap-4 sm:gap-5 lg:grid-cols-2">

        {/* OPEN INCIDENTS */}
        <Card className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">

          <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-4 sm:px-5">

            <div className="flex min-w-0 items-center gap-2 sm:gap-3">

              <div className="shrink-0 rounded-xl bg-violet-100 p-2 sm:p-2.5">
                <ClipboardList className="h-5 w-5 text-violet-700" />
              </div>

              <div className="min-w-0">

                <h2 className="text-base font-bold tracking-tight text-slate-900 sm:text-lg">
                  Open Incidents
                </h2>

                <p className="mt-1 text-xs text-slate-500 sm:text-sm">
                  Important incidents requiring attention
                </p>

              </div>

            </div>

            <span className="shrink-0 rounded-full bg-violet-100 px-3 py-1 text-xs font-bold text-violet-700">
              {incidents ? incidents.length : "—"}
            </span>

          </div>

          <CardContent className="min-w-0 p-3 sm:p-5">

            {!incidents ? (

              <div className="space-y-3 p-2">
                {Array.from({ length: 5 }).map((_, index) => (
                  <Skeleton
                    key={index}
                    className="h-12 w-full rounded-xl"
                  />
                ))}
              </div>

            ) : incidents.length === 0 ? (

              <div className="flex min-h-[220px] flex-col items-center justify-center text-center sm:min-h-[260px]">

                <div className="mb-3 rounded-full bg-emerald-100 p-4">
                  <ClipboardList className="h-7 w-7 text-emerald-600" />
                </div>

                <p className="text-base font-bold text-slate-900">
                  No open incidents
                </p>

                <p className="mt-1 text-sm text-slate-500">
                  All reported incidents have been resolved.
                </p>

              </div>

            ) : (

              <div className="space-y-2">

                {/* TABLE HEADER - DESKTOP */}
                <div className="hidden grid-cols-[65px_minmax(0,1fr)_auto] items-center gap-2 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 sm:grid">
                  <span>Machine</span>
                  <span>Incident</span>
                  <span>Severity</span>
                </div>

                {incidents.map((incident: Incident) => (

                  <div
                    key={incident.id}
                    className="grid min-w-0 grid-cols-[55px_minmax(0,1fr)] items-center gap-x-2 gap-y-2 rounded-xl bg-[#faf9ff] px-3 py-3 transition hover:bg-violet-50 sm:grid-cols-[65px_minmax(0,1fr)_auto] sm:gap-2"
                  >

                    <span className="text-xs font-bold text-slate-900 sm:text-sm">
                      {incident.machine_id ?? "—"}
                    </span>

                    <div className="min-w-0">

                      <p className="break-words text-sm font-semibold text-slate-900">
                        {typeLabel(incident.incident_type)}
                      </p>

                      <p className="mt-1 break-words text-xs text-slate-500">
                        {incident.location ?? "Location unavailable"}
                      </p>

                    </div>

                    <div className="col-start-2 sm:col-start-auto">
                      <SeverityBadge severity={incident.severity} />
                    </div>

                  </div>

                ))}

              </div>

            )}

          </CardContent>

          <div className="border-t border-slate-100 px-3 py-3 sm:px-5">
            <p className="text-xs text-slate-500">
              Incident information refreshes automatically every 5 seconds.
            </p>
          </div>

        </Card>

        {/* VOICE SUMMARY */}
        <Card className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">

          <div className="flex items-center gap-3 border-b border-slate-100 px-3 py-4 sm:px-5">

            <div className="shrink-0 rounded-xl bg-violet-100 p-2.5">
              <AudioLines className="h-5 w-5 text-violet-700" />
            </div>

            <div className="min-w-0">

              <h2 className="text-base font-bold tracking-tight text-slate-900 sm:text-lg">
                Voice Summary
              </h2>

              <p className="mt-1 text-xs text-slate-500 sm:text-sm">
                AI-generated shift briefing
              </p>

            </div>

          </div>

          <CardContent className="flex min-w-0 flex-1 flex-col p-3 sm:p-5">

            {/* AUDIO PLAYER */}
            <div className="flex min-w-0 items-center gap-2 rounded-xl border border-violet-100 bg-gradient-to-r from-violet-50 to-purple-50 p-3 sm:gap-4 sm:p-4">

              <button
                type="button"
                onClick={playSummary}
                disabled={!summary?.audio_url || playing}
                aria-label="Play voice summary"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-violet-700 shadow-sm transition hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-50 sm:h-11 sm:w-11"
              >
                {playing ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Play className="ml-0.5 h-5 w-5 fill-current" />
                )}
              </button>

              <div className="flex h-12 min-w-0 flex-1 items-center justify-center gap-[3px] overflow-hidden">

                {waveformHeights.map((height, index) => (
                  <span
                    key={index}
                    className="w-[3px] shrink-0 rounded-full bg-violet-500"
                    style={{
                      height: `${height}px`,
                      opacity: 0.45 + (index % 4) * 0.12,
                    }}
                  />
                ))}

              </div>

              <Volume2 className="h-5 w-5 shrink-0 text-violet-500" />

            </div>

            {/* SUMMARY TRANSCRIPT */}
            <div className="mt-5 min-w-0 flex-1">

              <div className="mb-3 flex items-center justify-between gap-2">

                <h3 className="text-sm font-bold text-slate-900 sm:text-base">
                  Summary Transcript
                </h3>

                {summary && (
                  <span className="shrink-0 text-xs text-slate-500">
                    {summary.word_count} words
                  </span>
                )}

              </div>

              <div className="min-h-[150px] min-w-0 rounded-xl border border-violet-100 bg-[#faf9ff] p-3 sm:p-4">

                {summary ? (

                  <p className="break-words text-sm leading-7 text-slate-700">
                    &quot;{summary.text}&quot;
                  </p>

                ) : (

                  <div className="flex min-h-[115px] flex-col items-center justify-center text-center">

                    <AudioLines className="mb-3 h-8 w-8 text-violet-300" />

                    <p className="text-sm font-semibold text-slate-700">
                      Your voice summary will appear here.
                    </p>

                    <p className="mt-1 text-sm text-slate-500">
                      Generate a summary of current open incidents.
                    </p>

                  </div>

                )}

              </div>

              {summary && (
                <div className="mt-3 flex flex-wrap gap-2">

                  <span className="max-w-full break-words rounded-lg bg-violet-50 px-3 py-1.5 text-xs font-medium text-violet-700">
                    {summary.summary_by}
                  </span>

                  {summary.fallback_reason && (
                    <span className="rounded-lg bg-amber-50 px-3 py-1.5 text-xs text-amber-700">
                      Fallback used
                    </span>
                  )}

                </div>
              )}

            </div>

            {/* ERROR */}
            {summaryError && (
              <div className="mt-3 flex min-w-0 items-start gap-2 break-words rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{summaryError}</span>
              </div>
            )}

            {/* GENERATE BUTTON */}
            <Button
              onClick={generateSummary}
              disabled={summaryLoading}
              className="mt-5 h-12 w-full rounded-xl bg-violet-600 text-sm font-semibold text-white shadow-md shadow-violet-200 transition hover:bg-violet-700"
            >

              {summaryLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating Summary...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  {summary
                    ? "Generate New Summary"
                    : "Generate Voice Summary"}
                </>
              )}

            </Button>

          </CardContent>

        </Card>

      </div>

      {/* FOOTER */}
      <div className="flex flex-wrap items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-3 text-center text-xs text-slate-500 sm:px-4">

        <Clock3 className="h-4 w-4 shrink-0 text-violet-500" />

        <span>Live incident monitoring · Updated every 5 seconds</span>

      </div>

    </div>
  );
}