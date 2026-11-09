"use client";

import { useCallback, useState } from "react";
import { Filter } from "lucide-react";

import { api } from "@/lib/api";
import {
  capitalize,
  SEVERITIES,
  STATUSES,
  STATUS_LABELS,
} from "@/lib/format";

import { useAutoRefresh } from "@/lib/use-auto-refresh";
import {
  IncidentsTable,
  IncidentsTableSkeleton,
} from "@/components/incidents-table";

import { Card, CardContent } from "@/components/ui/card";

const selectClass =
  "w-full min-w-0 rounded-lg border border-border bg-white px-3 py-2.5 text-sm shadow-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100";

export default function IncidentsPage() {
  const [severity, setSeverity] = useState("");
  const [status, setStatus] = useState("");

  // Filtering happens in the backend.
  const load = useCallback(
    () => api.incidents({ severity, status }),
    [severity, status]
  );

  const { data, error } = useAutoRefresh(load, 5000);

  return (
    <div className="min-w-0 space-y-5 sm:space-y-6">

      {/* HEADER */}
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-[28px]">
          Incidents
        </h1>

        <p className="mt-1 text-sm text-slate-500">
          Every reported incident, newest first.
        </p>
      </header>

      {/* FILTERS */}
      <section className="rounded-2xl border border-violet-100 bg-white p-3 shadow-sm sm:p-4">

        <div className="mb-3 flex items-center gap-2">
          <Filter className="h-4 w-4 text-violet-600" />

          <h2 className="text-sm font-bold text-slate-800">
            Filter Incidents
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">

          {/* SEVERITY FILTER */}
          <label className="flex min-w-0 flex-col gap-1.5 text-sm font-semibold text-slate-700">
            Severity

            <select
              className={selectClass}
              value={severity}
              onChange={(e) => setSeverity(e.target.value)}
            >
              <option value="">All Severities</option>

              {SEVERITIES.map((s) => (
                <option key={s} value={s}>
                  {capitalize(s)}
                </option>
              ))}
            </select>
          </label>

          {/* STATUS FILTER */}
          <label className="flex min-w-0 flex-col gap-1.5 text-sm font-semibold text-slate-700">
            Status

            <select
              className={selectClass}
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">All Statuses</option>

              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </label>

        </div>

      </section>

      {/* ERROR MESSAGE */}
      {error && (
        <div className="break-words rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700">
          {error}
        </div>
      )}

      {/* INCIDENTS TABLE */}
      <Card className="min-w-0 overflow-hidden rounded-2xl border border-violet-100 bg-white shadow-sm">

        <CardContent className="min-w-0 p-2 sm:p-4">

          {data ? (
            <div className="w-full min-w-0 overflow-x-auto">
              <IncidentsTable incidents={data} />
            </div>
          ) : (
            <IncidentsTableSkeleton rows={8} />
          )}

        </CardContent>

      </Card>

    </div>
  );
}