"use client";

import Link from "next/link";
import { AlertOctagon, AlertTriangle, CheckCircle2, Loader, Siren } from "lucide-react";
import { api } from "@/lib/api";
import { currentShift, greeting, typeLabel } from "@/lib/format";
import { useAutoRefresh } from "@/lib/use-auto-refresh";
import { IncidentsTable } from "@/components/incidents-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Load stats and incidents together; refreshed every 5 seconds by useAutoRefresh.
async function loadDashboard() {
  const [stats, incidents] = await Promise.all([api.stats(), api.incidents()]);
  return { stats, incidents };
}

export default function DashboardPage() {
  const { data, error } = useAutoRefresh(loadDashboard, 5000);
  const now = new Date();

  const openCritical = data?.incidents.filter((i) => i.severity === "critical" && i.status !== "resolved") ?? [];

  const cards = [
    {
      label: "Critical (open)",
      value: data?.stats.unresolved_by_severity.critical,
      icon: AlertOctagon,
      style: "bg-red-50 text-red-700",
    },
    {
      label: "High (open)",
      value: data?.stats.unresolved_by_severity.high,
      icon: AlertTriangle,
      style: "bg-orange-50 text-orange-700",
    },
    { label: "In Progress", value: data?.stats.by_status.in_progress, icon: Loader, style: "bg-sky-50 text-sky-700" },
    {
      label: "Resolved",
      value: data?.stats.by_status.resolved,
      icon: CheckCircle2,
      style: "bg-emerald-50 text-emerald-700",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{greeting(now)}, Supervisor</h1>
          <p className="text-sm text-slate-500">Here&apos;s what&apos;s happening on the plant floor.</p>
        </div>
        <div className="rounded-lg border bg-white px-4 py-2 text-right">
          <p className="text-xs text-slate-500">Current Shift</p>
          <p className="text-sm font-medium">{currentShift(now)}</p>
        </div>
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          Cannot reach the backend at localhost:8000. Is it running? ({error})
        </p>
      )}

      {/* Simulated alert: the app never controls machines, it only shows this banner. */}
      {openCritical.length > 0 && (
        <div className="flex items-start gap-3 rounded-xl bg-red-600 p-4 text-white shadow">
          <Siren className="mt-0.5 size-5 shrink-0" />
          <div>
            <p className="font-semibold">
              Simulated alert — {openCritical.length} critical incident{openCritical.length > 1 ? "s" : ""} open
            </p>
            <ul className="mt-1 text-sm text-red-50">
              {openCritical.map((i) => (
                <li key={i.id}>
                  <Link href={`/incidents/${i.id}`} className="underline">
                    {i.id}
                  </Link>{" "}
                  · {i.machine_id ?? "Unknown machine"} · {typeLabel(i.incident_type)}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {cards.map(({ label, value, icon: Icon, style }) => (
          <div key={label} className={`rounded-xl p-4 ${style}`}>
            <Icon className="size-5" />
            <p className="mt-2 text-3xl font-semibold">{data ? (value ?? 0) : "—"}</p>
            <p className="text-sm">{label}</p>
          </div>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Recent Incidents</CardTitle>
          <Link href="/incidents" className="text-sm text-[#6d4ae8] hover:underline">
            View all →
          </Link>
        </CardHeader>
        <CardContent>
          {data ? <IncidentsTable incidents={data.incidents.slice(0, 8)} /> : <p className="text-sm">Loading…</p>}
        </CardContent>
      </Card>
    </div>
  );
}
