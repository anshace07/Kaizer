import { AlertTriangle, BookOpen, Bot, Loader2, Wrench } from "lucide-react";
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
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-slate-600">
        <Loader2 className="size-6 animate-spin text-[#6d4ae8]" />
        <p>Investigating… {inv.tool_calls.length} tool call(s) so far</p>
        <ToolTrace inv={inv} />
      </div>
    );
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
            <td className="font-mono">{c.tool}</td>
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
  if (inv?.status === "running") return <p className="py-6 text-sm text-slate-500">Investigating… the SOP appears when done.</p>;
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
