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
    <div className="min-h-full space-y-7">

      {/* HEADER */}
      <div>
        <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-700">
          <Activity className="h-3.5 w-3.5" />
          MACHINE MONITORING
        </div>

        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          Machine Insights
        </h1>

        <p className="mt-2 text-sm text-slate-500">
          Monitor machine health, active incidents and upcoming maintenance
          across your factory.
        </p>
      </div>

      {/* ERROR */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Unable to load machine information: {error}
        </div>
      )}

      {/* SUMMARY CARDS */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((item) => {
          const Icon = item.icon;

          return (
            <Card
              key={item.title}
              className="rounded-2xl border border-slate-100 bg-white shadow-sm"
            >
              <CardContent className="flex items-center justify-between p-5">
                <div>
                  <p className="text-sm font-medium text-slate-500">
                    {item.title}
                  </p>

                  <p className="mt-2 text-3xl font-bold text-slate-900">
                    {loading ? "—" : item.value}
                  </p>

                  <p className="mt-1 text-xs text-slate-400">
                    {item.description}
                  </p>
                </div>

                <div className={`rounded-xl p-3 ${item.color}`}>
                  <Icon className="h-6 w-6" />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* MACHINE STATUS */}
      <Card className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <CardContent className="p-5 sm:p-6">

          {/* SECTION HEADER */}
          <div className="mb-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-lg font-bold tracking-tight text-slate-900">
                Machine Status Overview
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Live status based on recorded unresolved incidents.
              </p>
            </div>

            {/* SEARCH */}
            <div className="relative w-full sm:w-72">
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

          {/* TABLE */}
          <div className="overflow-x-auto">
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