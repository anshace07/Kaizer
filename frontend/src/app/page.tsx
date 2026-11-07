"use client";

import Image from "next/image";
import Link from "next/link";

import {
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  Factory,
  Activity,
  Loader,
} from "lucide-react";

import { api } from "@/lib/api";
import { currentShift, greeting, typeLabel } from "@/lib/format";
import { useAutoRefresh } from "@/lib/use-auto-refresh";
import { AnimatedNumber } from "@/components/animated-number";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

async function loadDashboard() {
  const [stats, incidents, machines] = await Promise.all([
    api.stats(),
    api.incidents(),
    api.machines(),
  ]);

  return { stats, incidents, machines };
}

export default function DashboardPage() {
  const { data, error } = useAutoRefresh(loadDashboard, 5000);

  const now = new Date();

  // Dashboard statistics
  const cards = [
    {
      label: "Critical",
      value: data?.stats.unresolved_by_severity.critical ?? 0,
      icon: AlertOctagon,
      background: "bg-[#fff0f0]",
      iconBackground: "bg-red-100",
      color: "text-red-600",
      description: "Critical incidents",
    },
    {
      label: "High",
      value: data?.stats.unresolved_by_severity.high ?? 0,
      icon: AlertTriangle,
      background: "bg-[#fff8e9]",
      iconBackground: "bg-amber-100",
      color: "text-amber-700",
      description: "High priority",
    },
    {
      label: "In Progress",
      value: data?.stats.by_status.in_progress ?? 0,
      icon: Loader,
      background: "bg-[#eff5ff]",
      iconBackground: "bg-blue-100",
      color: "text-blue-700",
      description: "Being handled",
    },
    {
      label: "Resolved",
      value: data?.stats.by_status.resolved ?? 0,
      icon: CheckCircle2,
      background: "bg-[#edfaf2]",
      iconBackground: "bg-emerald-100",
      color: "text-emerald-700",
      description: "Successfully resolved",
    },
  ];

  // Plant areas come from the machines' locations, so every area
  // (including the Utility Block) shows up.
  const units = [
    ...new Set((data?.machines ?? []).map((machine) => machine.location)),
  ]
    .sort()
    .map((location) => ({
      location,
      machineCount: (data?.machines ?? []).filter(
        (machine) => machine.location === location
      ).length,
    }));

  // Calculate unit status
  function getUnitStatus(location: string) {
    const openIncidents =
      data?.incidents.filter(
        (incident) =>
          incident.location === location &&
          incident.status !== "resolved"
      ) ?? [];

    if (
      openIncidents.some(
        (incident) => incident.severity === "critical"
      )
    ) {
      return {
        label: "Critical",
        style: "bg-red-100 text-red-700",
        dot: "bg-red-500",
      };
    }

    if (openIncidents.length > 0) {
      return {
        label: "Attention",
        style: "bg-amber-100 text-amber-700",
        dot: "bg-amber-500",
      };
    }

    return {
      label: "Operational",
      style: "bg-emerald-100 text-emerald-700",
      dot: "bg-emerald-500",
    };
  }

  // Format incident time
  function formatTime(date: string) {
    return new Date(date).toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  }

  // Severity colors
  function severityStyle(severity: string) {
    const styles: Record<string, string> = {
      critical: "bg-red-100 text-red-700",
      high: "bg-amber-100 text-amber-700",
      medium: "bg-blue-100 text-blue-700",
      low: "bg-slate-100 text-slate-600",
    };

    return styles[severity] ?? "bg-slate-100 text-slate-600";
  }

  return (
    <div className="min-h-full space-y-5 bg-transparent">

      {/* HEADER */}
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">

        <div>
          <div className="mb-2 flex items-center gap-2">

            <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-bold text-violet-700">
              PLANTPULSE AI
            </span>

            <span className="flex items-center gap-1.5 text-sm font-semibold text-emerald-600">
              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
              Live monitoring
            </span>

          </div>

          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
            {greeting(now)}, Supervisor
          </h1>

          <p className="mt-1 text-base font-medium text-slate-600">
            Here&apos;s what&apos;s happening on your plant floor.
          </p>
        </div>

        {/* CURRENT SHIFT */}
        <div className="flex items-center gap-3 rounded-2xl border border-violet-100 bg-white px-4 py-3 shadow-sm">

          <div className="rounded-full bg-violet-100 p-2">
            <Clock3 className="h-5 w-5 text-violet-700" />
          </div>

          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Current Shift
            </p>

            <p className="text-base font-bold text-slate-800">
              {currentShift(now)}
            </p>
          </div>

        </div>

      </header>

      {/* BACKEND ERROR */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
          Backend connection error: {error}
        </div>
      )}

      {/* INCIDENT OVERVIEW */}
      <section>

        <div className="mb-3">
          <h2 className="text-lg font-extrabold text-slate-900">
            Incident Overview
          </h2>

          <p className="text-sm font-medium text-slate-600">
            Live incident statistics from your backend.
          </p>
        </div>

        {/* FOUR CARDS */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">

          {cards.map((card) => {
            const Icon = card.icon;

            return (
              <div
                key={card.label}
                className={`flex min-h-[115px] items-center justify-between rounded-2xl border border-white px-4 py-3 shadow-sm ${card.background}`}
              >

                <div className="min-w-0">

                  <p className={`text-base font-bold ${card.color}`}>
                    {card.label}
                  </p>

                  {data ? (
                    <p className={`mt-1 text-4xl font-extrabold ${card.color}`}>
                      <AnimatedNumber value={card.value} />
                    </p>
                  ) : (
                    <Skeleton className="mt-2 h-9 w-12 bg-white/70" />
                  )}

                  <p className="mt-1 text-xs font-semibold text-slate-600">
                    {card.description}
                  </p>

                </div>

                <div className={`shrink-0 rounded-full p-2.5 ${card.iconBackground}`}>
                  <Icon className={`h-6 w-6 ${card.color}`} />
                </div>

              </div>
            );
          })}

        </div>

      </section>

      {/* RECENT INCIDENTS + PLANT STATUS */}
      <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-12">

        {/* RECENT INCIDENTS */}
        <Card className="overflow-hidden rounded-2xl border border-violet-100 bg-white shadow-sm lg:col-span-8">

          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-4">

            <div>
              <h2 className="text-lg font-extrabold text-slate-900">
                Recent Incidents
              </h2>

              <p className="mt-1 text-sm font-medium text-slate-500">
                Latest reported incidents
              </p>
            </div>

            <Link
              href="/incidents"
              className="flex items-center gap-1 text-sm font-bold text-violet-700 hover:underline"
            >
              View All
              <ArrowRight className="h-4 w-4" />
            </Link>

          </div>

          <CardContent className="p-0">

            {!data ? (

              <div className="space-y-3 p-5">
                {[1, 2, 3].map((n) => (
                  <Skeleton key={n} className="h-9 w-full" />
                ))}
              </div>

            ) : data.incidents.length === 0 ? (

              <p className="p-8 text-center text-sm font-medium text-slate-500">
                No incidents reported yet.
              </p>

            ) : (

              <div className="overflow-x-auto">

                <table className="w-full min-w-[540px] text-left text-sm">

                  <thead className="bg-[#f8f6ff] text-slate-600">
                    <tr>
                      <th className="px-3 py-3 font-bold">Time</th>
                      <th className="px-3 py-3 font-bold">Machine</th>
                      <th className="px-3 py-3 font-bold">Incident</th>
                      <th className="px-3 py-3 font-bold">Severity</th>
                      <th className="px-3 py-3 font-bold">Status</th>
                    </tr>
                  </thead>

                  <tbody>

                    {data.incidents.slice(0, 5).map((incident) => (

                      <tr
                        key={incident.id}
                        className="border-t border-slate-100 transition hover:bg-violet-50/50"
                      >

                        <td className="whitespace-nowrap px-3 py-3 font-medium text-slate-600">
                          {formatTime(incident.created_at)}
                        </td>

                        <td className="whitespace-nowrap px-3 py-3 font-bold text-slate-700">
                          {incident.machine_id ?? "—"}
                        </td>

                        <td className="max-w-[130px] px-3 py-3">

                          <Link
                            href={`/incidents/${incident.id}`}
                            className="block truncate font-semibold text-slate-800 hover:text-violet-700"
                            title={typeLabel(incident.incident_type)}
                          >
                            {typeLabel(incident.incident_type)}
                          </Link>

                        </td>

                        <td className="whitespace-nowrap px-3 py-3">

                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-bold ${severityStyle(incident.severity)}`}
                          >
                            {incident.severity.charAt(0).toUpperCase() +
                              incident.severity.slice(1)}
                          </span>

                        </td>

                        <td className="whitespace-nowrap px-3 py-3">

                          <span className="text-xs font-bold text-slate-700">
                            {incident.escalated
                              ? "Escalated"
                              : incident.status === "in_progress"
                                ? "In Progress"
                                : incident.status.charAt(0).toUpperCase() +
                                  incident.status.slice(1)}
                          </span>

                        </td>

                      </tr>

                    ))}

                  </tbody>

                </table>

              </div>

            )}

          </CardContent>

        </Card>

        {/* PLANT STATUS */}
        <Card className="overflow-hidden rounded-2xl border border-violet-100 bg-white shadow-sm lg:col-span-4">

          <div className="flex items-center justify-between px-4 pb-3 pt-4">

            <div>
              <h2 className="flex items-center gap-2 text-lg font-extrabold text-slate-900">
                <Factory className="h-5 w-5 text-violet-600" />
                Plant Status
              </h2>

              <p className="mt-1 text-sm font-medium text-slate-500">
                Factory monitoring and machine status
              </p>
            </div>

            <Activity className="h-5 w-5 text-violet-500" />

          </div>

          <CardContent className="space-y-3 px-4 pb-4 pt-0">

            {/* FACTORY IMAGE */}
            <div className="relative h-[125px] w-full overflow-hidden rounded-xl bg-violet-100">

              <Image
                src="/factory.png"
                alt="Industrial factory plant"
                fill
                priority
                sizes="(max-width: 1024px) 100vw, 33vw"
                className="object-cover"
              />

              <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />

              <div className="absolute bottom-2 left-3 text-sm font-bold text-white">
                Industrial Plant
              </div>

            </div>

            {/* PRODUCTION UNITS */}
            <div>

              <h3 className="mb-2 text-sm font-extrabold text-slate-800">
                Plant Areas
              </h3>

              <div className="overflow-hidden rounded-xl border border-slate-100">

                {units.map((unit, index) => {

                  const status = getUnitStatus(unit.location);

                  return (

                    <div
                      key={unit.location}
                      className={`flex items-center justify-between gap-2 px-3 py-3 ${
                        index !== 0 ? "border-t border-slate-100" : ""
                      }`}
                    >

                      <div className="min-w-0">

                        <p className="text-sm font-bold text-slate-700">
                          {unit.location}
                        </p>

                        <p className="text-xs font-medium text-slate-500">
                          {unit.machineCount} machines
                        </p>

                      </div>

                      <span
                        className={`flex shrink-0 items-center gap-1.5 rounded-full px-2 py-1 text-xs font-bold ${status.style}`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
                        {status.label}
                      </span>

                    </div>

                  );

                })}

              </div>

            </div>

          </CardContent>

        </Card>

      </div>

      {/* FOOTER */}
      <div className="flex items-center justify-center gap-2 pb-2 text-xs font-medium text-slate-500">

        <Activity className="h-4 w-4 text-violet-500" />

        Dashboard automatically refreshes every 5 seconds

      </div>

    </div>
  );
}