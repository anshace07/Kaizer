import { capitalize, STATUS_LABELS } from "@/lib/format";

// Severity is always colour + a text label, so it still reads correctly for colour-blind users.
const SEVERITY_STYLES: Record<string, string> = {
  critical: "bg-red-100 text-red-700 ring-red-200",
  high: "bg-orange-100 text-orange-700 ring-orange-200",
  medium: "bg-amber-100 text-amber-800 ring-amber-200",
  low: "bg-slate-100 text-slate-700 ring-slate-200",
};

const STATUS_STYLES: Record<string, string> = {
  open: "bg-slate-100 text-slate-700",
  acknowledged: "bg-sky-100 text-sky-700",
  in_progress: "bg-indigo-100 text-indigo-700",
  resolved: "bg-emerald-100 text-emerald-700",
};

export function SeverityBadge({ severity }: { severity: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${
        SEVERITY_STYLES[severity] ?? SEVERITY_STYLES.low
      }`}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {capitalize(severity)}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
        STATUS_STYLES[status] ?? STATUS_STYLES.open
      }`}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}
