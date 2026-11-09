"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  BrainCircuit,
  Clock,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Database,
  Gauge,
  Zap,
  Siren,
} from "lucide-react";

import { api, type PerformanceMetrics } from "@/lib/api";

function formatNumber(value: number | null, suffix = "") {
  return value === null ? "N/A" : `${value.toLocaleString("en-IN")}${suffix}`;
}

function MetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
  color,
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md sm:p-5 lg:hover:-translate-y-1">
      <div className="flex items-center justify-between gap-2">
        <div className="rounded-xl bg-violet-50 p-2.5 sm:p-3">
          <Icon className={`size-5 ${color}`} />
        </div>

        <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-medium text-emerald-700 sm:px-2.5 sm:text-xs">
          Live data
        </span>
      </div>

      <p className="mt-4 text-sm font-medium text-slate-500 sm:mt-5">
        {title}
      </p>

      <h2 className="mt-1 break-words text-xl font-bold text-slate-800 sm:text-2xl">
        {value}
      </h2>

      <p className="mt-2 text-xs leading-relaxed text-slate-400">
        {subtitle}
      </p>
    </div>
  );
}

export default function PerformancePage() {
  const [data, setData] = useState<PerformanceMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadMetrics = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const result = await api.performance();
      setData(result);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to load performance data."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMetrics();
  }, [loadMetrics]);

  const processedCount = data
    ? data.llm_incidents + data.fallback_incidents
    : 0;

  const otherCount = data
    ? Math.max(0, data.total_incidents - processedCount)
    : 0;

  return (
    <div className="min-w-0 space-y-5 sm:space-y-7">

      {/* HEADER */}
      <header className="flex min-w-0 flex-col justify-between gap-4 sm:flex-row sm:items-center">

        <div className="min-w-0">

          <div className="mb-2 flex flex-wrap items-center gap-2">

            <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-700">
              KAIZER ANALYTICS
            </span>

            <span className="flex items-center gap-1 text-xs font-medium text-emerald-600">
              <span className="size-2 animate-pulse rounded-full bg-emerald-500" />
              {loading
                ? "Updating"
                : error
                  ? "Connection issue"
                  : "Live database"}
            </span>

          </div>

          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            AI Performance
          </h1>

          <p className="mt-1 text-sm text-slate-500">
            Real-time operational metrics from saved factory incidents.
          </p>

        </div>

        <button
          onClick={loadMetrics}
          disabled={loading}
          className="flex w-full shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:opacity-50 sm:w-auto"
        >
          <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
          Refresh data
        </button>

      </header>

      {/* ERROR */}
      {error && (
        <div className="flex min-w-0 items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 sm:p-4">

          <AlertTriangle className="mt-0.5 size-5 shrink-0" />

          <div className="min-w-0 break-words">
            <p className="font-semibold">
              Unable to load performance metrics
            </p>

            <p className="mt-1">{error}</p>

            <button
              onClick={loadMetrics}
              className="mt-2 font-semibold underline"
            >
              Try again
            </button>
          </div>

        </div>
      )}

      {/* LOADING */}
      {loading && !data && (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center sm:p-10">
          <RefreshCw className="mx-auto mb-3 size-7 animate-spin text-violet-600" />

          <p className="text-sm text-slate-500">
            Loading live performance metrics...
          </p>
        </div>
      )}

      {/* METRICS */}
      {data && (
        <>

          <section className="grid grid-cols-2 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">

            <MetricCard
              title="Total Incidents"
              value={formatNumber(data.total_incidents)}
              subtitle="Records saved in the database"
              icon={Database}
              color="text-violet-500"
            />

            <MetricCard
              title="Average Analysis Time"
              value={formatNumber(data.average_analysis_time_ms, " ms")}
              subtitle="Measured incident analysis duration"
              icon={Clock}
              color="text-blue-500"
            />

            <MetricCard
              title="LLM Response Time"
              value={formatNumber(data.average_llm_response_time_ms, " ms")}
              subtitle="Average recorded LLM response duration"
              icon={BrainCircuit}
              color="text-emerald-500"
            />

            <MetricCard
              title="Fallback Rate"
              value={formatNumber(data.fallback_rate_percent, "%")}
              subtitle="Incidents processed by keyword fallback"
              icon={Zap}
              color="text-orange-500"
            />

          </section>

          {/* PROCESSING BREAKDOWN */}
          <section className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-2">

            <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">

              <div className="flex items-center gap-3">

                <div className="shrink-0 rounded-xl bg-violet-50 p-2.5 sm:p-3">
                  <BrainCircuit className="size-5 text-violet-600" />
                </div>

                <div className="min-w-0">
                  <h2 className="font-semibold text-slate-800">
                    AI Processing Breakdown
                  </h2>

                  <p className="text-xs text-slate-500">
                    Recorded extraction methods
                  </p>
                </div>

              </div>

              <div className="mt-6 space-y-6">

                {[
                  {
                    label: "LLM processed",
                    value: data.llm_incidents,
                    color: "bg-violet-500",
                  },
                  {
                    label: "Keyword fallback",
                    value: data.fallback_incidents,
                    color: "bg-orange-400",
                  },
                  {
                    label: "Other / unclassified",
                    value: otherCount,
                    color: "bg-slate-400",
                  },
                ].map((item) => {

                  const percentage =
                    data.total_incidents > 0
                      ? (item.value / data.total_incidents) * 100
                      : 0;

                  return (

                    <div key={item.label}>

                      <div className="mb-2 flex flex-wrap justify-between gap-1 text-sm">

                        <span className="text-slate-600">
                          {item.label}
                        </span>

                        <span className="font-semibold text-slate-800">
                          {item.value} ({percentage.toFixed(1)}%)
                        </span>

                      </div>

                      <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">

                        <div
                          className={`h-full rounded-full ${item.color}`}
                          style={{ width: `${percentage}%` }}
                        />

                      </div>

                    </div>

                  );
                })}

              </div>

              <p className="mt-5 text-xs leading-5 text-slate-400">
                Breakdown uses the extractor field saved with each incident.
              </p>

            </div>

            {/* SAFETY */}
            <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">

              <div className="flex items-center gap-3">

                <div className="shrink-0 rounded-xl bg-red-50 p-2.5 sm:p-3">
                  <ShieldCheck className="size-5 text-red-600" />
                </div>

                <div className="min-w-0">
                  <h2 className="font-semibold text-slate-800">
                    Safety Monitoring
                  </h2>

                  <p className="text-xs text-slate-500">
                    Recorded safety events
                  </p>
                </div>

              </div>

              <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4">

                <div className="min-w-0 rounded-xl bg-red-50 p-3 sm:p-5">

                  <Siren className="mb-3 size-5 text-red-600" />

                  <p className="text-2xl font-bold text-red-700 sm:text-3xl">
                    {formatNumber(data.critical_incidents)}
                  </p>

                  <p className="mt-1 text-xs text-red-600">
                    Critical incidents
                  </p>

                </div>

                <div className="min-w-0 rounded-xl bg-orange-50 p-3 sm:p-5">

                  <AlertTriangle className="mb-3 size-5 text-orange-600" />

                  <p className="text-2xl font-bold text-orange-700 sm:text-3xl">
                    {formatNumber(data.safety_escalations)}
                  </p>

                  <p className="mt-1 text-xs text-orange-600">
                    Safety escalations
                  </p>

                </div>

                <div className="col-span-2 rounded-xl bg-emerald-50 p-4 sm:p-5">

                  <div className="flex items-center justify-between gap-3">

                    <div className="min-w-0">
                      <p className="text-2xl font-bold text-emerald-700 sm:text-3xl">
                        {formatNumber(data.incidents_with_safety_rule_hits)}
                      </p>

                      <p className="mt-1 text-xs text-emerald-700">
                        Incidents with safety rule hits
                      </p>
                    </div>

                    <CheckCircle2 className="size-7 shrink-0 text-emerald-600" />

                  </div>

                </div>

              </div>

            </div>

          </section>

          {/* ADDITIONAL METRICS */}
          <section className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-2">

            {/* MODEL CONFIDENCE */}
            <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">

              <div className="flex items-center gap-3">

                <div className="shrink-0 rounded-xl bg-blue-50 p-2.5 sm:p-3">
                  <Gauge className="size-5 text-blue-600" />
                </div>

                <div className="min-w-0">
                  <h2 className="font-semibold text-slate-800">
                    Model Confidence
                  </h2>

                  <p className="text-xs text-slate-500">
                    LLM self-reported confidence
                  </p>
                </div>

              </div>

              <p className="mt-6 text-3xl font-bold text-slate-800 sm:text-4xl">
                {data.average_llm_self_reported_confidence === null
                  ? "N/A"
                  : `${(data.average_llm_self_reported_confidence * 100).toFixed(1)}%`}
              </p>

              <p className="mt-3 text-xs leading-5 text-amber-700">
                This is confidence reported by the model, not independently
                measured detection or classification accuracy.
              </p>

            </div>

            {/* DATA SOURCE */}
            <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">

              <div className="flex items-center gap-3">

                <div className="shrink-0 rounded-xl bg-emerald-50 p-2.5 sm:p-3">
                  <Activity className="size-5 text-emerald-600" />
                </div>

                <div className="min-w-0">
                  <h2 className="font-semibold text-slate-800">
                    Data Source & Evaluation
                  </h2>

                  <p className="text-xs text-slate-500">
                    Current dashboard data status
                  </p>
                </div>

              </div>

              <div className="mt-6 rounded-xl bg-emerald-50 p-4 sm:p-5">

                <div className="flex items-center gap-2 text-emerald-700">
                  <CheckCircle2 className="size-5 shrink-0" />

                  <span className="font-semibold">
                    Backend connected
                  </span>
                </div>

                <p className="mt-3 text-sm leading-6 text-slate-600">
                  Metrics are calculated from saved incident records in the
                  operational database.
                </p>

              </div>

              <p className="mt-4 break-words text-xs leading-5 text-slate-400">
                {data.note}
              </p>

            </div>

          </section>

        </>
      )}

    </div>
  );
}