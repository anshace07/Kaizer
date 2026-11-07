"use client";

import { useCallback, useState } from "react";
import { api } from "@/lib/api";
import { capitalize, SEVERITIES, STATUSES, STATUS_LABELS } from "@/lib/format";
import { useAutoRefresh } from "@/lib/use-auto-refresh";
import { IncidentsTable, IncidentsTableSkeleton } from "@/components/incidents-table";
import { Card, CardContent } from "@/components/ui/card";

const selectClass = "rounded-lg border border-border bg-white px-3 py-2 text-sm shadow-sm";

export default function IncidentsPage() {
  const [severity, setSeverity] = useState("");
  const [status, setStatus] = useState("");

  // Filtering happens in the backend (?severity=&status=).
  const load = useCallback(() => api.incidents({ severity, status }), [severity, status]);
  const { data, error } = useAutoRefresh(load, 5000);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[28px] font-semibold tracking-tight">Incidents</h1>
        <p className="text-sm text-slate-500">Every reported incident, newest first.</p>
      </div>

      <div className="flex gap-3">
        <label className="flex items-center gap-2 text-sm">
          Severity
          <select className={selectClass} value={severity} onChange={(e) => setSeverity(e.target.value)}>
            <option value="">All</option>
            {SEVERITIES.map((s) => (
              <option key={s} value={s}>
                {capitalize(s)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          Status
          <select className={selectClass} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && <p className="text-sm text-red-700">{error}</p>}

      <Card>
        <CardContent>{data ? <IncidentsTable incidents={data} /> : <IncidentsTableSkeleton rows={8} />}</CardContent>
      </Card>
    </div>
  );
}
