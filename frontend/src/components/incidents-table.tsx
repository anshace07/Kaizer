"use client";

import { useRouter } from "next/navigation";
import type { Incident } from "@/lib/api";
import { formatDateTime, typeLabel } from "@/lib/format";
import { EscalatedBadge, SeverityBadge, StatusBadge } from "./badges";

// Used on the Dashboard (recent incidents) and the Incidents page. Click a row to open it.
export function IncidentsTable({ incidents }: { incidents: Incident[] }) {
  const router = useRouter();

  if (incidents.length === 0) {
    return <p className="py-8 text-center text-sm text-slate-500">No incidents match.</p>;
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b text-left text-xs text-slate-500">
          <th className="py-2 font-medium">Reported</th>
          <th className="py-2 font-medium">ID</th>
          <th className="py-2 font-medium">Machine</th>
          <th className="py-2 font-medium">Incident</th>
          <th className="py-2 font-medium">Severity</th>
          <th className="py-2 font-medium">Status</th>
        </tr>
      </thead>
      <tbody>
        {incidents.map((inc) => (
          <tr
            key={inc.id}
            onClick={() => router.push(`/incidents/${inc.id}`)}
            className="cursor-pointer border-b last:border-0 hover:bg-violet-50/60"
          >
            <td className="py-2.5 text-slate-500">{formatDateTime(inc.created_at)}</td>
            <td className="py-2.5 font-medium text-[#6d4ae8]">{inc.id}</td>
            <td className="py-2.5">{inc.machine_id ?? "—"}</td>
            <td className="py-2.5">{typeLabel(inc.incident_type)}</td>
            <td className="py-2.5">
              <SeverityBadge severity={inc.severity} />
            </td>
            <td className="space-x-1 py-2.5">
              <StatusBadge status={inc.status} />
              {inc.escalated && inc.status !== "resolved" && <EscalatedBadge />}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
