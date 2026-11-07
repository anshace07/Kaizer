"use client";

import Link from "next/link";
import { AlertOctagon, AlertTriangle, ArrowRight, CheckCircle2, Clock, Loader, Siren } from "lucide-react";
import { api } from "@/lib/api";
import { currentShift, greeting, typeLabel } from "@/lib/format";
import { useAutoRefresh } from "@/lib/use-auto-refresh";
import { AnimatedNumber } from "@/components/animated-number";
import { IncidentsTable, IncidentsTableSkeleton } from "@/components/incidents-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// Load stats and incidents together; refreshed every 5 seconds by useAutoRefresh.
async function loadDashboard() {
  const [stats, incidents] = await Promise.all([api.stats(), api.incidents()]);
  return { stats, incidents };
}

export default function DashboardPage() {
  const { data, error } = useAutoRefresh(loadDashboard, 5000);
  const now = new Date();

  const openCritical = data?.incidents.filter((i) => i.severity === "critical" && i.status !== "resolved") ?? [];

  // Plain counts from /api/stats — nothing estimated.
  const cards = [
    {
      label: "Critical (open)",
      value: data?.stats.unresolved_by_severity.critical,
      icon: AlertOctagon,
      tone: "bg-red-50 text-red-600",
      tile: "bg-white text-red-500",
    },
    {
      label: "High (open)",
      value: data?.stats.unresolved_by_severity.high,
      icon: AlertTriangle,
      tone: "bg-amber-50 text-amber-700",
      tile: "bg-white text-amber-500",
    },
    {
      label: "In Progress",
      value: data?.stats.by_status.in_progress,
      icon: Loader,
      tone: "bg-sky-50 text-sky-700",
      tile: "bg-white text-sky-500",
    },
    {
      label: "Resolved",
      value: data?.stats.by_status.resolved,
      icon: CheckCircle2,
      tone: "bg-emerald-50 text-emerald-700",
      tile: "bg-white text-emerald-500",
    },
  ];

  return (
    <div className="space-y-7">
      <div className="flex items-start justify-between gap-6">
        <div>
          <h1 className="text-[28px] font-semibold tracking-tight">{greeting(now)}, Supervisor 👋</h1>
          <p className="mt-1 text-sm text-slate-500">Here&apos;s what&apos;s happening on the plant floor.</p>
        </div>
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-white px-4 py-2.5 shadow-[var(--pp-shadow)]">
          <Clock className="size-4 text-[#6d4ae8]" />
          <div>
            <p className="text-[11px] uppercase tracking-wide text-slate-400">Current shift</p>
            <p className="text-sm font-semibold">{currentShift(now)}</p>
          </div>
        </div>
      </div>

      {error && (
        <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">
          Cannot reach the backend at localhost:8000. Is it running? ({error})
        </p>
      )}

      {/* Simulated alert (compact strip; the big slide-in banner is the global AlarmWatcher). */}
      {openCritical.length > 0 && (
        <div className="flex items-center gap-3 overflow-hidden rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-800">
          <Siren className="size-4 shrink-0 text-red-600" />
          <span className="shrink-0 font-semibold">
            Simulated alert · {openCritical.length} critical open
          </span>
          <span className="min-w-0 truncate text-red-700">
            {openCritical.map((i, n) => (
              <span key={i.id}>
                {n > 0 && " · "}
                <Link href={`/incidents/${i.id}`} className="font-medium underline underline-offset-2">
                  {i.id}
                </Link>{" "}
                {i.machine_id ?? "?"} {typeLabel(i.incident_type)}
              </span>
            ))}
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-5 xl:grid-cols-4">
        {cards.map(({ label, value, icon: Icon, tone, tile }) => (
          <div key={label} className={`rounded-2xl p-5 shadow-[var(--pp-shadow)] ${tone}`}>
            <span className={`flex size-10 items-center justify-center rounded-xl shadow-sm ${tile}`}>
              <Icon className="size-5" />
            </span>
            {data ? (
              <p className="mt-4 text-4xl font-semibold tracking-tight">
                <AnimatedNumber value={value ?? 0} />
              </p>
            ) : (
              <Skeleton className="mt-4 h-10 w-14 bg-white/70" />
            )}
            <p className="mt-1 text-sm font-medium">{label}</p>
          </div>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Recent Incidents</CardTitle>
          <Link href="/incidents" className="flex items-center gap-1 text-sm font-medium text-[#6d4ae8] hover:underline">
            View all <ArrowRight className="size-4" />
          </Link>
        </CardHeader>
        <CardContent>
          {data ? <IncidentsTable incidents={data.incidents.slice(0, 8)} flashNew /> : <IncidentsTableSkeleton />}
        </CardContent>
      </Card>
    </div>
  );
}
