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
      className={`inline-flex whitespace-nowrap rounded-full border px-3 py-1 text-xs font-semibold ${severityStyles[severity]}`}
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
    <div className="min-h-full space-y-7">

      {/* HEADER */}
      <div>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-2 rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-700">
            SHIFT MANAGEMENT
          </span>

          <span className="flex items-center gap-1 text-xs font-medium text-emerald-600">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            Live updates
          </span>
        </div>

        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">
              Shift Handover Summary
            </h1>

            <p className="mt-2 text-sm text-slate-500">
              A quick voice summary of open and important incidents for the next shift.
            </p>
          </div>

          <div className="flex w-fit items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <div className="rounded-xl bg-violet-100 p-2.5">
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
      </div>

      {/* ERRORS */}
      {incidentsError && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          Unable to load incidents: {incidentsError}
        </div>
      )}

      {/* SUMMARY CARDS */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">

        <Card className="rounded-2xl border border-slate-100 bg-white shadow-sm">
          <CardContent className="p-5">
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
          <CardContent className="p-5">
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
          <CardContent className="p-5">
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

      </div>

      {/* MAIN TWO COLUMN LAYOUT */}
      <div className="grid items-stretch gap-5 lg:grid-cols-2">

        {/* OPEN INCIDENTS */}
        <Card className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">

          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-violet-100 p-2.5">
                <ClipboardList className="h-5 w-5 text-violet-700" />
              </div>

              <div>
                <h2 className="text-lg font-bold tracking-tight text-slate-900">
                  Open Incidents
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  Important incidents requiring attention
                </p>
              </div>
            </div>

            <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-bold text-violet-700">
              {incidents ? incidents.length : "—"}
            </span>
          </div>

          <CardContent className="p-4 sm:p-5">

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
              <div className="flex min-h-[260px] flex-col items-center justify-center text-center">
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

                <div className="grid grid-cols-[65px_1fr_auto] items-center gap-2 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <span>Machine</span>
                  <span>Incident</span>
                  <span>Severity</span>
                </div>

                {incidents.map((incident: Incident) => (
                  <div
                    key={incident.id}
                    className="grid grid-cols-[65px_1fr_auto] items-center gap-2 rounded-xl bg-[#faf9ff] px-3 py-3 transition hover:bg-violet-50"
                  >
                    <span className="text-sm font-bold text-slate-900">
                      {incident.machine_id ?? "—"}
                    </span>

                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {typeLabel(incident.incident_type)}
                      </p>

                      <p className="mt-1 truncate text-xs text-slate-500">
                        {incident.location ?? "Location unavailable"}
                      </p>
                    </div>

                    <SeverityBadge severity={incident.severity} />
                  </div>
                ))}
              </div>
            )}

          </CardContent>

          <div className="border-t border-slate-100 px-5 py-3">
            <p className="text-xs text-slate-500">
              Incident information refreshes automatically every 5 seconds.
            </p>
          </div>
        </Card>

        {/* VOICE SUMMARY */}
        <Card className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">

          <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
            <div className="rounded-xl bg-violet-100 p-2.5">
              <AudioLines className="h-5 w-5 text-violet-700" />
            </div>

            <div>
              <h2 className="text-lg font-bold tracking-tight text-slate-900">
                Voice Summary
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                AI-generated shift briefing
              </p>
            </div>
          </div>

          <CardContent className="flex flex-1 flex-col p-5">

            {/* AUDIO PLAYER */}
            <div className="flex items-center gap-4 rounded-xl border border-violet-100 bg-gradient-to-r from-violet-50 to-purple-50 p-4">

              <button
                type="button"
                onClick={playSummary}
                disabled={!summary?.audio_url || playing}
                aria-label="Play voice summary"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-violet-700 shadow-sm transition hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {playing ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Play className="ml-0.5 h-5 w-5 fill-current" />
                )}
              </button>

              <div className="flex h-12 flex-1 items-center justify-center gap-[3px] overflow-hidden">
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
            <div className="mt-5 flex-1">

              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-base font-bold text-slate-900">
                  Summary Transcript
                </h3>

                {summary && (
                  <span className="text-xs text-slate-500">
                    {summary.word_count} words
                  </span>
                )}
              </div>

              <div className="min-h-[150px] rounded-xl border border-violet-100 bg-[#faf9ff] p-4">

                {summary ? (
                  <p className="text-sm leading-7 text-slate-700">
                    "{summary.text}"
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
                  <span className="rounded-lg bg-violet-50 px-3 py-1.5 text-xs font-medium text-violet-700">
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
              <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {summaryError}
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
      <div className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-500">
        <Clock3 className="h-4 w-4 text-violet-500" />
        Live incident monitoring · Updated every 5 seconds
      </div>

    </div>
  );
}