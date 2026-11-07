"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Incident } from "@/lib/api";
import { formatDateTime, typeLabel } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import { EscalatedBadge, SeverityBadge, StatusBadge } from "./badges";

const HEADERS = ["Reported", "ID", "Machine", "Incident", "Severity", "Status"];

// Used on the Dashboard (recent incidents) and the Incidents page. Click a row to open it.
// With flashNew, rows that appear after the page loaded flash softly for 3 s (CSS animation runs once on mount).
export function IncidentsTable({ incidents, flashNew = false }: { incidents: Incident[]; flashNew?: boolean }) {
  const router = useRouter();
  const [initialIds] = useState(() => new Set(incidents.map((i) => i.id)));

  if (incidents.length === 0) {
    return <p className="py-10 text-center text-sm text-slate-500">No incidents match.</p>;
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b text-left text-xs uppercase tracking-wide text-slate-400">
          {HEADERS.map((h) => (
            <th key={h} className="pb-3 font-medium">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {incidents.map((inc) => (
          <tr
            key={inc.id}
            onClick={() => router.push(`/incidents/${inc.id}`)}
            className={`cursor-pointer border-b transition-colors last:border-0 hover:bg-violet-50/60 ${
              flashNew && !initialIds.has(inc.id) ? "pp-row-flash" : ""
            }`}
          >
            <td className="py-3.5 text-slate-500">{formatDateTime(inc.created_at)}</td>
            <td className="py-3.5 font-semibold text-[#6d4ae8]">{inc.id}</td>
            <td className="py-3.5 font-medium">{inc.machine_id ?? "—"}</td>
            <td className="py-3.5">{typeLabel(inc.incident_type)}</td>
            <td className="py-3.5">
              <SeverityBadge severity={inc.severity} />
            </td>
            <td className="space-x-1 py-3.5">
              <StatusBadge status={inc.status} />
              {inc.escalated && inc.status !== "resolved" && <EscalatedBadge />}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function IncidentsTableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-label="Loading incidents">
      <Skeleton className="h-4 w-full" />
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-9 w-full" />
      ))}
    </div>
  );
}
