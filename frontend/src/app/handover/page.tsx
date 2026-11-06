"use client";

import { Volume2 } from "lucide-react";
import { api, type Incident } from "@/lib/api";
import { currentShift, SEVERITIES, typeLabel } from "@/lib/format";
import { useAutoRefresh } from "@/lib/use-auto-refresh";
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
          <CardHeader>
            <CardTitle>Voice Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <EmptyState
              icon={Volume2}
              title="No voice summary yet"
              text="A spoken Hindi / Hinglish summary of these incidents will be generated here."
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
