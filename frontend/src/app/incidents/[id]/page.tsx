"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Link2, Loader2, ShieldAlert } from "lucide-react";
import { api, type Status } from "@/lib/api";
import { capitalize, DECIDED_BY, formatConfidence, formatDateTime, typeLabel } from "@/lib/format";
import { useAutoRefresh } from "@/lib/use-auto-refresh";
import { EscalatedBadge, SeverityBadge, StatusBadge } from "@/components/badges";
import { InvestigationPanel, SopPanel } from "@/components/investigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// Selected tab = white with purple text, so it stands out on the lavender page.
const tabClass = "px-3 data-active:bg-white data-active:text-[#6d4ae8]";

const ACTIONS: { status: Status; label: string }[] = [
  { status: "acknowledged", label: "Acknowledge" },
  { status: "in_progress", label: "In Progress" },
  { status: "resolved", label: "Resolve" },
];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[230px_1fr] gap-4 border-b py-3 text-sm last:border-0">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium">{children}</span>
    </div>
  );
}

export default function IncidentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const load = useCallback(() => api.incident(id), [id]);
  // 2 s refresh so the background investigation shows up live.
  const { data: inc, error, reload } = useAutoRefresh(load, 2000);
  const [busy, setBusy] = useState(false);

  // The backend changes the status AND writes a timeline event in one call.
  async function changeStatus(status: Status) {
    setBusy(true);
    try {
      await api.setStatus(id, status, "by supervisor (dashboard)");
      await reload();
    } finally {
      setBusy(false);
    }
  }

  // Possible duplicate: the supervisor decides. Nothing is ever merged automatically.
  async function decideDuplicate(action: "merge" | "keep_separate") {
    setBusy(true);
    try {
      await api.decideDuplicate(id, action);
      await reload();
    } finally {
      setBusy(false);
    }
  }

  if (error) return <p className="text-sm text-red-700">{error}</p>;
  if (!inc) {
    return (
      <div className="space-y-5" aria-label="Loading incident">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-9 w-80" />
        <Skeleton className="h-9 w-96" />
        <Skeleton className="h-72 w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-slate-500">
        <Link href="/incidents" className="hover:underline">
          Incidents
        </Link>{" "}
        › {inc.id}
      </p>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-[28px] font-semibold tracking-tight">Incident {inc.id}</h1>
            <SeverityBadge severity={inc.severity} />
            <StatusBadge status={inc.status} />
            {inc.escalated && <EscalatedBadge />}
            {inc.investigation?.status === "running" && (
              <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2.5 py-0.5 text-xs text-[#6d4ae8]">
                <Loader2 className="size-3 animate-spin" /> Investigating…
              </span>
            )}
          </div>
          <p className="text-sm text-slate-500">Reported {formatDateTime(inc.created_at)}</p>
        </div>
        <div className="flex gap-2">
          {ACTIONS.map((a) => (
            <Button
              key={a.status}
              variant={a.status === "resolved" ? "default" : "outline"}
              disabled={busy || inc.status === a.status}
              onClick={() => changeStatus(a.status)}
            >
              {a.label}
            </Button>
          ))}
        </div>
      </div>

      {inc.related_incident_id && inc.duplicate_status && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4">
          <p className="flex items-center gap-2 text-sm text-amber-900">
            <Link2 className="size-4" />
            Related to{" "}
            <Link href={`/incidents/${inc.related_incident_id}`} className="font-semibold underline">
              {inc.related_incident_id}
            </Link>
            {inc.duplicate_status === "pending" && " — same machine reported within 10 minutes. Same problem?"}
            {inc.duplicate_status === "merged" && ` — merged into ${inc.merged_into}.`}
            {inc.duplicate_status === "kept_separate" && " — kept as a separate incident."}
          </p>
          {inc.duplicate_status === "pending" && (
            <div className="flex gap-2">
              <Button size="sm" disabled={busy} onClick={() => decideDuplicate("merge")}>
                Merge
              </Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => decideDuplicate("keep_separate")}>
                Keep separate
              </Button>
            </div>
          )}
        </div>
      )}

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview" className={tabClass}>Overview</TabsTrigger>
          <TabsTrigger value="investigation" className={tabClass}>AI Investigation</TabsTrigger>
          <TabsTrigger value="sop" className={tabClass}>SOP &amp; Actions</TabsTrigger>
          <TabsTrigger value="timeline" className={tabClass}>Timeline</TabsTrigger>
        </TabsList>

        <Card className="mt-2">
          <CardContent>
            <TabsContent value="overview">
              <Field label="Machine ID">{inc.machine_id ?? "—"}</Field>
              <Field label="Incident">{typeLabel(inc.incident_type)}</Field>
              <Field label="Location">{inc.location ?? "—"}</Field>
              <Field label="Severity">
                <SeverityBadge severity={inc.severity} />
              </Field>
              <Field label="Symptoms">{inc.symptoms.length ? inc.symptoms.join(", ") : "—"}</Field>
              <Field label="Language">{capitalize(inc.language)}</Field>
              <Field label="Severity decided by">
                {DECIDED_BY[inc.severity_source ?? ""] ?? inc.severity_source ?? "—"}
                {inc.llm_severity && <span className="font-normal text-slate-500"> · AI suggested {inc.llm_severity}</span>}
              </Field>
              <Field label="Safety rules">
                {inc.rule_hits.length === 0 ? (
                  "None triggered"
                ) : (
                  <span className="flex flex-col gap-1 text-red-700">
                    {inc.rule_hits.map((h) => (
                      <span key={h.rule_id} className="flex items-center gap-1.5">
                        <ShieldAlert className="size-4" /> {h.rule_id} {h.rule_name}: “{h.keyword}” ({h.source})
                      </span>
                    ))}
                  </span>
                )}
              </Field>
              <Field label="Model confidence (self-reported)">{formatConfidence(inc.confidence)}</Field>
              <Field label="Extracted by">{inc.extractor ?? "—"}</Field>
              <Field label="Related incident">
                {inc.related_incident_id ? (
                  <Link href={`/incidents/${inc.related_incident_id}`} className="text-[#6d4ae8] hover:underline">
                    {inc.related_incident_id}
                  </Link>
                ) : (
                  "—"
                )}
              </Field>
              <Field label="Transcript">
                <span className="font-normal italic">“{inc.transcript || "—"}”</span>
              </Field>
              {inc.extracted && (
                <details className="pt-3 text-sm">
                  <summary className="cursor-pointer text-slate-500">Raw extraction JSON</summary>
                  <pre className="mt-2 overflow-x-auto rounded-md bg-slate-50 p-3 text-xs">
                    {JSON.stringify(inc.extracted, null, 2)}
                  </pre>
                </details>
              )}
            </TabsContent>

            <TabsContent value="investigation">
              <InvestigationPanel inv={inc.investigation} />
            </TabsContent>

            <TabsContent value="sop">
              <SopPanel inv={inc.investigation} />
            </TabsContent>

            <TabsContent value="timeline">
              <ol className="relative ml-2 border-l border-violet-200">
                {inc.events.map((ev, i) => (
                  <li key={i} className="mb-4 ml-4">
                    <span className="absolute -left-1.5 mt-1.5 size-3 rounded-full bg-[#6d4ae8]" />
                    <p className="text-xs text-slate-500">{formatDateTime(ev.timestamp)}</p>
                    <p className="text-sm font-medium">{capitalize(ev.action.replaceAll("_", " "))}</p>
                    <p className="text-sm text-slate-600">{ev.detail}</p>
                  </li>
                ))}
              </ol>
            </TabsContent>
          </CardContent>
        </Card>
      </Tabs>
    </div>
  );
}
