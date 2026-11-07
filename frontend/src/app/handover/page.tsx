"use client";

import { useState } from "react";
import { Loader2, Volume2 } from "lucide-react";
import { api, type HandoverSummary, type Incident } from "@/lib/api";
import { currentShift, SEVERITIES, typeLabel } from "@/lib/format";
import { useAutoRefresh } from "@/lib/use-auto-refresh";
import { audioSrc, play } from "@/lib/voice";
import { Button } from "@/components/ui/button";
import { SeverityBadge, StatusBadge } from "@/components/badges";
import { EmptyState } from "@/components/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Everything not resolved, most severe first.
async function loadOpen(): Promise<Incident[]> {
  const all = await api.incidents();
  const rank = (s: string) => SEVERITIES.indexOf(s as (typeof SEVERITIES)[number]);
  return all.filter((i) => i.status !== "resolved").sort((a, b) => rank(a.severity) - rank(b.severity));
}

export default function HandoverPage() {
  const { data, error } = useAutoRefresh(loadOpen, 5000);
  const [summary, setSummary] = useState<HandoverSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  // LLM writes the summary from open incidents only, Timbre speaks it. Text is shown even if audio fails.
  async function generate() {
    setBusy(true);
    setSummaryError(null);
    try {
      const result = await api.handoverSummary();
      setSummary(result);
      play(result);
    } catch (e) {
      setSummaryError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Shift Handover Summary</h1>
        <p className="text-sm text-slate-500">Open and important incidents for the next shift · {currentShift(new Date())}</p>
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Open Incidents ({data ? data.length : "—"})</CardTitle>
          </CardHeader>
          <CardContent>
            {data?.length === 0 && <p className="text-sm text-slate-500">Nothing open.</p>}
            <ul className="divide-y">
              {data?.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-2 py-2.5 text-sm">
                  <span className="w-14 font-medium">{i.machine_id ?? "—"}</span>
                  <span className="flex-1">{typeLabel(i.incident_type)}</span>
                  <StatusBadge status={i.status} />
                  <SeverityBadge severity={i.severity} />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Voice Summary</CardTitle>
            <Button onClick={generate} disabled={busy || !data?.length}>
              {busy ? <Loader2 className="animate-spin" /> : <Volume2 />}
              {busy ? "Generating…" : summary ? "Generate again" : "Generate summary"}
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {summaryError && <p className="text-sm text-red-700">{summaryError}</p>}
            {!summary && !busy && (
              <EmptyState
                icon={Volume2}
                title="No voice summary yet"
                text="Generate a spoken Hinglish summary of the open incidents (max 60 words, most severe first)."
              />
            )}
            {summary && (
              <>
                {audioSrc(summary) ? (
                  <audio controls src={audioSrc(summary)!} className="w-full" />
                ) : (
                  <p className="text-xs text-amber-700">Voice unavailable ({summary.tts_error}) — text below.</p>
                )}
                <p className="rounded-md bg-violet-50 p-3 text-base leading-relaxed">“{summary.text}”</p>
                <p className="text-xs text-slate-500">
                  {summary.word_count} words · written by {summary.summary_by}
                  {summary.fallback_reason && ` (${summary.fallback_reason})`} · from {summary.incident_ids.length} open
                  incidents · voice: Timbre v2.5{summary.tts_ms != null && ` · ${summary.tts_ms} ms`}
                  {summary.cached && " (cached)"}
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
