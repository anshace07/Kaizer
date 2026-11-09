"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Factory,
  Search,
  Wrench,
  ArrowRight,
  Loader2,
} from "lucide-react";

import { api, type Machine, type Incident } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";

type MachineStatus = "Critical" | "Attention" | "Operational";

function getMachineStatus(incidents: Incident[]): MachineStatus {
  const active = incidents.filter((i) => i.status !== "resolved");

  if (active.some((i) => i.severity === "critical")) return "Critical";

  if (
    active.some(
      (i) => i.severity === "high" || i.severity === "medium"
    )
  ) {
    return "Attention";
  }

  return "Operational";
}

function formatDate(date: string | null) {
  if (!date) return "Not scheduled";

  return new Date(`${date}T00:00:00`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function MachineInsightsPage() {
  const [machines, setMachines] = useState<Machine[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  async function loadData() {
    try {
      const [machineData, incidentData] = await Promise.all([
        api.machines(),
        api.incidents(),
      ]);

      setMachines(machineData);
      setIncidents(incidentData);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();

    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, []);

  const activeIncidents = incidents.filter(
    (incident) => incident.status !== "resolved"
  );

  const criticalCount = activeIncidents.filter(
    (incident) => incident.severity === "critical"
  ).length;

  const affectedMachines = new Set(
    activeIncidents
      .map((incident) => incident.machine_id)
      .filter(Boolean)
  ).size;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const maintenanceDue = machines.filter((machine) => {
    if (!machine.next_service_date) return false;

    const serviceDate = new Date(
      `${machine.next_service_date}T00:00:00`
    );

    return serviceDate <= today;
  }).length;

  const filteredMachines = machines.filter((machine) => {
    const query = search.toLowerCase();

    return (
      machine.id.toLowerCase().includes(query) ||
      machine.name.toLowerCase().includes(query) ||
      machine.location.toLowerCase().includes(query) ||
      machine.type.toLowerCase().includes(query)
    );
  });

  const summaryCards = [
    {
      title: "Total Machines",
      value: machines.length,
      description: "Registered machines",
      icon: Factory,
      color: "bg-violet-100 text-violet-700",
    },
    {
      title: "Affected Machines",
      value: affectedMachines,
      description: "With active incidents",
      icon: Activity,
      color: "bg-blue-100 text-blue-700",
    },
    {
      title: "Critical Issues",
      value: criticalCount,
      description: "Unresolved critical incidents",
      icon: AlertTriangle,
      color: "bg-red-100 text-red-700",
    },
    {
      title: "Maintenance Due",
      value: maintenanceDue,
      description: "Due today or overdue",
      icon: Wrench,
      color: "bg-amber-100 text-amber-700",
    },
  ];

  return (
    <div className="min-h-full min-w-0 space-y-5 sm:space-y-7">

      {/* HEADER */}
      <header className="min-w-0">

        <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-700">
          <Activity className="h-3.5 w-3.5" />
          MACHINE MONITORING
        </div>

        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          Machine Insights
        </h1>

        <p className="mt-2 max-w-3xl text-sm text-slate-500">
          Monitor machine health, active incidents and upcoming maintenance
          across your factory.
        </p>

      </header>

      {/* ERROR */}
      {error && (
        <div className="break-words rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 sm:p-4">
          Unable to load machine information: {error}
        </div>
      )}

      {/* SUMMARY CARDS */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">

        {summaryCards.map((item) => {
          const Icon = item.icon;

          return (
            <Card
              key={item.title}
              className="min-w-0 rounded-2xl border border-slate-100 bg-white shadow-sm"
            >
              <CardContent className="flex min-w-0 items-center justify-between gap-2 p-3 sm:p-5">

                <div className="min-w-0">

                  <p className="text-xs font-medium text-slate-500 sm:text-sm">
                    {item.title}
                  </p>

                  <p className="mt-2 text-2xl font-bold text-slate-900 sm:text-3xl">
                    {loading ? "—" : item.value}
                  </p>

                  <p className="mt-1 text-[10px] leading-tight text-slate-400 sm:text-xs">
                    {item.description}
                  </p>

                </div>

                <div className={`shrink-0 rounded-xl p-2 sm:p-3 ${item.color}`}>
                  <Icon className="h-5 w-5 sm:h-6 sm:w-6" />
                </div>

              </CardContent>
            </Card>
          );
        })}

      </section>

      {/* MACHINE STATUS */}
      <Card className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">

        <CardContent className="min-w-0 p-3 sm:p-6">

          {/* SECTION HEADER */}
          <div className="mb-5 flex min-w-0 flex-col justify-between gap-4 sm:flex-row sm:items-center">

            <div className="min-w-0">

              <h2 className="text-base font-bold tracking-tight text-slate-900 sm:text-lg">
                Machine Status Overview
              </h2>

              <p className="mt-1 text-xs text-slate-500 sm:text-sm">
                Live status based on recorded unresolved incidents.
              </p>

            </div>

            {/* SEARCH */}
            <div className="relative w-full min-w-0 sm:w-72 sm:shrink-0">

              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

              <input
                type="text"
                placeholder="Search machines..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
              />

            </div>

          </div>

          {/* MOBILE MACHINE CARDS */}
          <div className="space-y-3 md:hidden">

            {loading ? (

              <div className="space-y-3">
                {[1, 2, 3].map((item) => (
                  <div
                    key={item}
                    className="space-y-3 rounded-xl border border-slate-100 p-4"
                  >
                    <div className="h-4 w-1/2 animate-pulse rounded bg-slate-100" />
                    <div className="h-3 w-2/3 animate-pulse rounded bg-slate-100" />
                    <div className="h-3 w-1/3 animate-pulse rounded bg-slate-100" />
                  </div>
                ))}
              </div>

            ) : filteredMachines.length === 0 ? (

              <div className="py-10 text-center text-sm text-slate-500">
                No machines found.
              </div>

            ) : (

              filteredMachines.map((machine) => {

                const machineIncidents = incidents.filter(
                  (incident) => incident.machine_id === machine.id
                );

                const active = machineIncidents.filter(
                  (incident) => incident.status !== "resolved"
                );

                const status = getMachineStatus(machineIncidents);

                return (

                  <div
                    key={machine.id}
                    className="min-w-0 space-y-3 rounded-xl border border-slate-100 bg-[#faf9ff] p-3 sm:p-4"
                  >

                    <div className="flex min-w-0 items-start justify-between gap-2">

                      <div className="min-w-0">

                        <p className="break-words text-sm font-bold text-slate-900">
                          {machine.name}
                        </p>

                        <p className="mt-1 break-words text-xs text-slate-500">
                          {machine.id} · {machine.type}
                        </p>

                      </div>

                      <span
                        className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold sm:text-xs ${
                          status === "Critical"
                            ? "bg-red-50 text-red-700"
                            : status === "Attention"
                              ? "bg-amber-50 text-amber-700"
                              : "bg-emerald-50 text-emerald-700"
                        }`}
                      >
                        <span className="h-1.5 w-1.5 rounded-full bg-current" />
                        {status}
                      </span>

                    </div>

                    <div className="grid grid-cols-2 gap-3 border-t border-slate-100 pt-3">

                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                          Location
                        </p>

                        <p className="mt-1 break-words text-xs font-medium text-slate-700">
                          {machine.location}
                        </p>
                      </div>

                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                          Active Issues
                        </p>

                        <p className="mt-1 text-xs font-semibold text-slate-700">
                          {active.length}
                        </p>
                      </div>

                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                          Next Maintenance
                        </p>

                        <p className="mt-1 text-xs font-medium text-slate-700">
                          {formatDate(machine.next_service_date)}
                        </p>
                      </div>

                      <div className="flex items-end justify-end">

                        {machineIncidents.length > 0 ? (
                          <Link
                            href={`/incidents?machine_id=${machine.id}`}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-violet-700 hover:underline"
                          >
                            Incidents
                            <ArrowRight className="h-3.5 w-3.5" />
                          </Link>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                            <CheckCircle2 className="h-4 w-4" />
                            No incidents
                          </span>
                        )}

                      </div>

                    </div>

                  </div>

                );
              })

            )}

          </div>

          {/* DESKTOP TABLE */}
          <div className="hidden w-full overflow-x-auto md:block">

            <table className="w-full min-w-[750px] text-left text-sm">

              <thead>
                <tr className="border-b border-slate-100 bg-violet-50/70 text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3 font-semibold">Machine</th>
                  <th className="px-4 py-3 font-semibold">Location</th>
                  <th className="px-4 py-3 font-semibold">Active Issues</th>
                  <th className="px-4 py-3 font-semibold">Machine Status</th>
                  <th className="px-4 py-3 font-semibold">Next Maintenance</th>
                  <th className="px-4 py-3 font-semibold">Details</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">

                {loading ? (

                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-500">
                      <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin text-violet-600" />
                      Loading machine information...
                    </td>
                  </tr>

                ) : filteredMachines.length === 0 ? (

                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-500">
                      No machines found.
                    </td>
                  </tr>

                ) : (

                  filteredMachines.map((machine) => {

                    const machineIncidents = incidents.filter(
                      (incident) => incident.machine_id === machine.id
                    );

                    const active = machineIncidents.filter(
                      (incident) => incident.status !== "resolved"
                    );

                    const status = getMachineStatus(machineIncidents);

                    return (

                      <tr
                        key={machine.id}
                        className="transition hover:bg-violet-50/40"
                      >

                        <td className="px-4 py-4">
                          <p className="font-semibold text-slate-900">
                            {machine.name}
                          </p>

                          <p className="mt-1 text-xs text-slate-400">
                            {machine.id} · {machine.type}
                          </p>
                        </td>

                        <td className="px-4 py-4 text-slate-600">
                          {machine.location}
                        </td>

                        <td className="px-4 py-4">
                          <span className="font-semibold text-slate-800">
                            {active.length}
                          </span>

                          <span className="ml-1 text-xs text-slate-400">
                            active
                          </span>
                        </td>

                        <td className="px-4 py-4">
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${
                              status === "Critical"
                                ? "bg-red-50 text-red-700"
                                : status === "Attention"
                                  ? "bg-amber-50 text-amber-700"
                                  : "bg-emerald-50 text-emerald-700"
                            }`}
                          >
                            <span className="h-1.5 w-1.5 rounded-full bg-current" />
                            {status}
                          </span>
                        </td>

                        <td className="px-4 py-4 text-slate-600">
                          <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4 text-slate-400" />
                            {formatDate(machine.next_service_date)}
                          </div>
                        </td>

                        <td className="px-4 py-4">
                          {machineIncidents.length > 0 ? (
                            <Link
                              href={`/incidents?machine_id=${machine.id}`}
                              className="inline-flex items-center gap-1 font-medium text-violet-700 hover:underline"
                            >
                              Incidents
                              <ArrowRight className="h-3.5 w-3.5" />
                            </Link>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                              <CheckCircle2 className="h-4 w-4" />
                              No incidents
                            </span>
                          )}
                        </td>

                      </tr>

                    );
                  })

                )}

              </tbody>

            </table>

          </div>

          <p className="mt-4 text-xs text-slate-400">
            Machine status is derived from the incident records available in
            the backend. It does not represent live sensor telemetry.
          </p>

        </CardContent>

      </Card>

      {/* FOOTER */}
      <p className="text-center text-xs text-slate-400">
        Machine information refreshes automatically every 5 seconds.
      </p>

    </div>
  );
}