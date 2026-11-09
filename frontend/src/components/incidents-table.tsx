"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  Cpu,
  AlertTriangle,
  ChevronRight,
} from "lucide-react";

import type { Incident } from "@/lib/api";
import { formatDateTime, typeLabel } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import { EscalatedBadge, SeverityBadge, StatusBadge } from "./badges";

const HEADERS = [
  "Reported",
  "ID",
  "Machine",
  "Incident",
  "Severity",
  "Status",
];

// Used on the Dashboard and Incidents page.
// New rows flash softly for 3 seconds when they appear.
export function IncidentsTable({
  incidents,
  flashNew = false,
}: {
  incidents: Incident[];
  flashNew?: boolean;
}) {
  const router = useRouter();

  const [initialIds] = useState(
    () => new Set(incidents.map((i) => i.id))
  );

  if (incidents.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-slate-500">
        No incidents match.
      </p>
    );
  }

  return (
    <div className="w-full min-w-0">

      {/* MOBILE CARD LAYOUT */}
      <div className="space-y-3 md:hidden">

        {incidents.map((inc) => (
          <button
            key={inc.id}
            type="button"
            onClick={() => router.push(`/incidents/${inc.id}`)}
            className={`w-full min-w-0 rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-colors hover:border-violet-200 hover:bg-violet-50/40 active:bg-violet-50 ${
              flashNew && !initialIds.has(inc.id)
                ? "pp-row-flash"
                : ""
            }`}
          >

            {/* INCIDENT ID AND DATE */}
            <div className="flex min-w-0 items-start justify-between gap-3">

              <div className="min-w-0">

                <p className="break-words text-sm font-bold text-[#6d4ae8]">
                  {inc.id}
                </p>

                <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">

                  <CalendarDays className="h-3.5 w-3.5 shrink-0" />

                  <span className="break-words">
                    {formatDateTime(inc.created_at)}
                  </span>

                </div>

              </div>

              <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-400" />

            </div>

            {/* INCIDENT DETAILS */}
            <div className="mt-4 grid grid-cols-2 gap-4 border-t border-slate-100 pt-3">

              <div className="min-w-0">

                <p className="mb-1.5 text-xs font-medium text-slate-400">
                  Machine
                </p>

                <div className="flex min-w-0 items-center gap-1.5">

                  <Cpu className="h-3.5 w-3.5 shrink-0 text-violet-500" />

                  <span className="break-words text-sm font-semibold text-slate-800">
                    {inc.machine_id ?? "—"}
                  </span>

                </div>

              </div>

              <div className="min-w-0">

                <p className="mb-1.5 text-xs font-medium text-slate-400">
                  Incident
                </p>

                <div className="flex min-w-0 items-start gap-1.5">

                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />

                  <span className="break-words text-sm font-medium text-slate-800">
                    {typeLabel(inc.incident_type)}
                  </span>

                </div>

              </div>

            </div>

            {/* SEVERITY AND STATUS */}
            <div className="mt-4 flex min-w-0 flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">

              <div className="flex min-w-0 flex-wrap items-center gap-2">

                <SeverityBadge severity={inc.severity} />

                <StatusBadge status={inc.status} />

              </div>

              {inc.escalated && inc.status !== "resolved" && (
                <EscalatedBadge />
              )}

            </div>

          </button>
        ))}

      </div>

      {/* TABLE LAYOUT FOR TABLETS AND DESKTOP */}
      <div className="hidden w-full overflow-x-auto md:block">

        <table className="w-full min-w-[760px] text-sm">

          <thead>
            <tr className="border-b text-left text-xs uppercase tracking-wide text-slate-400">

              {HEADERS.map((h) => (
                <th
                  key={h}
                  className="whitespace-nowrap pb-3 pr-4 font-medium last:pr-0"
                >
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
                tabIndex={0}
                role="button"
                aria-label={`Open incident ${inc.id}`}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    router.push(`/incidents/${inc.id}`);
                  }
                }}
                className={`cursor-pointer border-b transition-colors last:border-0 hover:bg-violet-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-500 ${
                  flashNew && !initialIds.has(inc.id)
                    ? "pp-row-flash"
                    : ""
                }`}
              >

                <td className="whitespace-nowrap py-3.5 pr-4 text-slate-500">
                  {formatDateTime(inc.created_at)}
                </td>

                <td className="whitespace-nowrap py-3.5 pr-4 font-semibold text-[#6d4ae8]">
                  {inc.id}
                </td>

                <td className="whitespace-nowrap py-3.5 pr-4 font-medium">
                  {inc.machine_id ?? "—"}
                </td>

                <td className="py-3.5 pr-4">
                  {typeLabel(inc.incident_type)}
                </td>

                <td className="whitespace-nowrap py-3.5 pr-4">
                  <SeverityBadge severity={inc.severity} />
                </td>

                <td className="whitespace-nowrap py-3.5">
                  <div className="flex items-center gap-1">
                    <StatusBadge status={inc.status} />

                    {inc.escalated && inc.status !== "resolved" && (
                      <EscalatedBadge />
                    )}
                  </div>
                </td>

              </tr>
            ))}

          </tbody>

        </table>

      </div>

    </div>
  );
}

export function IncidentsTableSkeleton({
  rows = 6,
}: {
  rows?: number;
}) {
  return (
    <div
      className="space-y-3"
      aria-label="Loading incidents"
      aria-busy="true"
    >
      <Skeleton className="h-4 w-full" />

      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}