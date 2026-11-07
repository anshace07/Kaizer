import { AlertTriangle, BookOpen, Bot, CheckCircle2, Circle, Loader2, Wrench } from "lucide-react";
import type { Investigation, SopSection } from "@/lib/api";
import { EmptyState } from "@/components/empty-state";

type History = { history: { date: string; event_type: string; description: string }[]; past_incidents: { id: string; date: string; incident_type: string; severity: string; status: string }[] };
type Tickets = { open_tickets: { id: string; title: string; priority: string; opened_on: string; assigned_team: string }[] };
type Schedule = { last_service: string | null; next_service: string | null; days_until_next_service: number | null };

function evidence<T>(inv: Investigation, tool: string): T | null {
  return (inv.evidence.find((e) => e.tool === tool)?.result as T) ?? null;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
      {children}
    </div>
  );
}

export function InvestigationPanel({ inv }: { inv: Investigation | null }) {
  if (!inv) {
    return (
      <EmptyState icon={Bot} title="No AI investigation" text="Incidents reported before the investigation step was added have none." />
    );
  }
  if (inv.status === "running") {
    return <InvestigationSteps inv={inv} />;
  }
  if (inv.status === "failed") {
    return <p className="py-6 text-sm text-red-700">Investigation failed: {inv.error}</p>;
  }

  const history = evidence<History>(inv, "get_machine_history");
  const tickets = evidence<Tickets>(inv, "check_open_tickets");
  const schedule = evidence<Schedule>(inv, "get_maintenance_schedule");

  return (
    <div className="space-y-6 py-2">
      <p className="text-xs text-slate-500">
        Path: {inv.path === "tool_calling" ? "LLM tool calling" : `Fixed order (fallback: ${inv.fallback_reason})`} ·
        summary by {inv.summary_by} · {inv.total_ms} ms total · uses only the tool results below
      </p>

      <Section title="Findings">
        <ol className="list-decimal space-y-1 pl-5 text-sm">
          {inv.findings?.map((f, i) => <li key={i}>{f}</li>)}
        </ol>
      </Section>

      <div className="rounded-lg border border-violet-200 bg-violet-50 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#6d4ae8]">Recommended action</p>
        <p className="mt-1 text-sm font-medium">{inv.recommended_action}</p>
        <p className="mt-1 text-xs text-slate-500">Based on: {inv.sop_id ?? "no SOP section found"}</p>
      </div>

      {!!inv.evidence_missing?.length && (
        <p className="flex items-start gap-2 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" /> Missing evidence: {inv.evidence_missing.join("; ")}
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Section title="Machine history">
          {history ? (
            <ul className="space-y-1 text-sm">
              {history.history.map((h, i) => (
                <li key={i}><span className="text-slate-500">{h.date}</span> · {h.event_type}: {h.description}</li>
              ))}
              {history.past_incidents.map((p) => (
                <li key={p.id}><span className="text-slate-500">{p.date}</span> · {p.id} {p.incident_type} ({p.severity}, {p.status})</li>
              ))}
              {!history.history.length && !history.past_incidents.length && <li>No history on record.</li>}
            </ul>
          ) : <p className="text-sm text-slate-500">Not checked.</p>}
        </Section>
        <Section title="Open tickets">
          {tickets ? (
            <ul className="space-y-1 text-sm">
              {tickets.open_tickets.map((t) => (
                <li key={t.id}><span className="font-medium">{t.id}</span> {t.title} · {t.priority} · {t.assigned_team} · opened {t.opened_on}</li>
              ))}
              {!tickets.open_tickets.length && <li>No open tickets.</li>}
            </ul>
          ) : <p className="text-sm text-slate-500">Not checked.</p>}
        </Section>
        <Section title="Maintenance">
          {schedule ? (
            <p className="text-sm">
              Next service: <span className="font-medium">{schedule.next_service ?? "—"}</span>
              {schedule.days_until_next_service != null && ` (${schedule.days_until_next_service} days)`}
              <br />
              <span className="text-slate-500">Last service: {schedule.last_service ?? "—"}</span>
            </p>
          ) : <p className="text-sm text-slate-500">Not checked.</p>}
        </Section>
      </div>

      <Section title="Tool-call trace">
        <ToolTrace inv={inv} />
      </Section>
    </div>
  );
}

// Live progress: each step ticks off when that REAL tool call has finished (from inv.tool_calls).
const STEPS = [
  { tool: "get_machine_history", label: "Machine history" },
  { tool: "check_open_tickets", label: "Open tickets" },
  { tool: "get_maintenance_schedule", label: "Maintenance schedule" },
  { tool: "search_sop", label: "Safety manual (SOP)" },
];

export function InvestigationSteps({ inv }: { inv: Investigation }) {
  const doneCall = (tool: string) => inv.tool_calls.find((c) => c.tool === tool && c.ok);
  const firstOpen = STEPS.findIndex((s) => !doneCall(s.tool));
  const rows = [...STEPS.map((s) => ({ ...s, call: doneCall(s.tool) })), { tool: "summary", label: "Writing findings", call: undefined }];
  const current = firstOpen === -1 ? STEPS.length : firstOpen;

  return (
    <div className="mx-auto max-w-md py-8">
      <p className="mb-5 flex items-center justify-center gap-2 text-sm font-medium text-[#6d4ae8]">
        <Loader2 className="size-4 animate-spin" /> Investigating…
      </p>
      <ol className="space-y-2.5">
        {rows.map((row, i) => {
          const done = !!row.call;
          const active = !done && i === current;
          return (
            <li
              key={row.tool}
              className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm transition-all duration-300 ${
                done ? "border-emerald-200 bg-emerald-50/70" : active ? "border-violet-200 bg-violet-50 shadow-sm" : "border-border bg-white opacity-60"
              }`}
            >
              {done ? (
                <CheckCircle2 className="animate-in zoom-in size-5 text-emerald-600 duration-300" />
              ) : active ? (
                <Loader2 className="size-5 animate-spin text-[#6d4ae8]" />
              ) : (
                <Circle className="size-5 text-slate-300" />
              )}
              <span className={`flex-1 ${done ? "text-emerald-900" : "text-slate-700"}`}>{row.label}</span>
              {row.call && <span className="text-xs tabular-nums text-emerald-700">{row.call.ms} ms</span>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function ToolTrace({ inv }: { inv: Investigation }) {
  if (!inv.tool_calls.length) return null;
  return (
    <table className="w-full text-left text-xs">
      <thead className="text-slate-500">
        <tr><th className="py-1">#</th><th>Tool</th><th>Arguments</th><th>Result</th><th className="text-right">ms</th></tr>
      </thead>
      <tbody>
        {inv.tool_calls.map((c, i) => (
          <tr key={i} className={`border-t ${c.ok ? "" : "text-red-700"}`}>
            <td className="py-1.5">{i + 1}</td>
            <td className="font-mono">
              {c.tool}
              {c.auto && (
                <span title="The model skipped this tool, so it was run automatically" className="ml-1.5 rounded bg-slate-100 px-1.5 py-0.5 font-sans text-[10px] text-slate-600">
                  auto
                </span>
              )}
            </td>
            <td className="font-mono">{JSON.stringify(c.args)}</td>
            <td>{c.summary}</td>
            <td className="text-right tabular-nums">{c.ms}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// Tiny renderer for our SOP markdown: **bold** headings, "- " bullets and "1. " steps.
export function SopText({ section }: { section: SopSection }) {
  return (
    <div className="space-y-1 text-sm">
      <h3 className="flex items-center gap-2 font-semibold">
        <BookOpen className="size-4 text-[#6d4ae8]" /> {section.id} — {section.title}
      </h3>
      {section.text.split("\n").map((line, i) => {
        const t = line.trim();
        if (!t) return null;
        if (/^\*\*.+\*\*$/.test(t)) return <p key={i} className="pt-2 font-medium text-slate-700">{t.slice(2, -2)}</p>;
        if (t.startsWith("- ")) return <p key={i} className="pl-4">• {t.slice(2).replaceAll("**", "")}</p>;
        return <p key={i} className="pl-4">{t.replaceAll("**", "")}</p>;
      })}
    </div>
  );
}

export function SopPanel({ inv }: { inv: Investigation | null }) {
  if (inv?.status === "running") return <InvestigationSteps inv={inv} />;
  if (!inv?.sop_section) {
    return <EmptyState icon={BookOpen} title="No SOP matched" text="No safety-manual section was found for this incident." />;
  }
  return (
    <div className="space-y-5 py-2">
      <div className="rounded-lg border border-violet-200 bg-violet-50 p-4">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[#6d4ae8]">
          <Wrench className="size-3.5" /> Recommended action
        </p>
        <p className="mt-1 text-sm font-medium">{inv.recommended_action}</p>
      </div>
      <SopText section={inv.sop_section} />
      <p className="text-xs text-slate-400">Source: data/sop.md (synthetic safety manual)</p>
    </div>
  );
}
