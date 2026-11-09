"use client";

import { useEffect, useState } from "react";
import { Cpu, RotateCcw, Settings, ShieldAlert } from "lucide-react";

import { api, type Health } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// Only in next dev AND when the backend has ALLOW_DEMO_RESET=true.
const IS_DEV = process.env.NODE_ENV === "development";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 border-b border-slate-100 py-3 last:border-0 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="break-words text-left text-sm font-semibold text-slate-900 sm:max-w-[65%] sm:text-right">
        {value}
      </span>
    </div>
  );
}

function SectionHeading({
  icon: Icon,
  title,
  description,
  tone = "violet",
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  tone?: "violet" | "amber";
}) {
  const colors =
    tone === "amber"
      ? "bg-amber-100 text-amber-700"
      : "bg-violet-100 text-violet-700";

  return (
    <div className="mb-5 flex min-w-0 items-start gap-3">
      <div className={`shrink-0 rounded-xl p-2.5 ${colors}`}>
        <Icon className="h-5 w-5" />
      </div>

      <div className="min-w-0">
        <h2 className="text-base font-bold tracking-tight text-slate-900 sm:text-lg">
          {title}
        </h2>

        <p className="mt-1 break-words text-xs leading-relaxed text-slate-500 sm:text-sm">
          {description}
        </p>
      </div>
    </div>
  );
}

// Settings shows the models the backend is actually using,
// and (in dev) a button to restore the clean synthetic seed data.
export default function SettingsPage() {
  const [health, setHealth] = useState<Health | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    api.health()
      .then(setHealth)
      .catch((e) =>
        setMessage(e instanceof Error ? e.message : String(e))
      );
  }, []);

  async function reset() {
    setBusy(true);

    try {
      const r = await api.resetDemo();

      setMessage(
        `Demo reset: ${r.incidents} seed incidents and ${r.machines} machines restored.`
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <div className="min-h-full min-w-0 space-y-5 sm:space-y-7">

      {/* HEADER */}
      <header className="min-w-0">

        <div className="mb-3 inline-flex max-w-full items-center gap-2 rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-700">
          <Settings className="h-3.5 w-3.5 shrink-0" />
          SYSTEM CONFIGURATION
        </div>

        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          Settings
        </h1>

        <p className="mt-2 text-sm leading-relaxed text-slate-500">
          Models in use and demo tools. All data is synthetic.
        </p>

      </header>

      {/* SETTINGS GRID */}
      <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-5">

        {/* MODELS */}
        <Card className="min-w-0 rounded-2xl border border-slate-200 bg-white shadow-sm">

          <CardContent className="min-w-0 p-4 sm:p-6">

            <SectionHeading
              icon={Cpu}
              title="Models"
              description="Read live from the backend (/api/health)."
            />

            {health ? (
              <div className="min-w-0">

                <Row
                  label="Speech-to-text"
                  value={`Gnani Prisma (${health.stt_model})`}
                />

                <Row
                  label="Text-to-speech"
                  value={`Gnani Timbre (${health.tts_model}), voice ${health.tts_voice}`}
                />

                <Row
                  label="LLM"
                  value={health.llm_model}
                />

                <Row
                  label="LLM if rate-limited"
                  value={
                    health.llm_fallback_model ??
                    "none (keyword fallback)"
                  }
                />

                <Row
                  label="LLM request limit"
                  value={`${health.llm_max_rpm} per minute`}
                />

                <Row
                  label="Data"
                  value={health.data}
                />

              </div>
            ) : (
              <div className="space-y-4">

                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <Skeleton
                    key={i}
                    className="h-10 w-full"
                  />
                ))}

              </div>
            )}

          </CardContent>
        </Card>

        {/* RESET DEMO (DEV ONLY) */}
        {IS_DEV && health?.demo_reset_enabled && (
          <Card className="min-w-0 rounded-2xl border border-amber-200 bg-white shadow-sm">

            <CardContent className="min-w-0 space-y-4 p-4 sm:p-6">

              <SectionHeading
                icon={RotateCcw}
                title="Reset demo (dev only)"
                description="Restore the clean synthetic seed data."
                tone="amber"
              />

              <p className="break-words text-sm leading-relaxed text-slate-600">
                Deletes <b>every</b> incident (including ones you created)
                and restores the clean seed data. Use it before recording
                a demo. This cannot be undone.
              </p>

              {!confirming ? (

                <Button
                  variant="outline"
                  onClick={() => setConfirming(true)}
                  disabled={busy}
                  className="w-full sm:w-auto"
                >
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Reset demo
                </Button>

              ) : (

                <div className="flex min-w-0 flex-col gap-3 rounded-xl bg-amber-50 p-3 sm:flex-row sm:flex-wrap sm:items-center">

                  <div className="flex min-w-0 items-start gap-2 sm:flex-1">

                    <ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-700" />

                    <span className="text-sm leading-relaxed text-amber-900">
                      Wipe all incidents and reseed?
                    </span>

                  </div>

                  <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">

                    <Button
                      size="sm"
                      className="w-full bg-red-600 hover:bg-red-700 sm:w-auto"
                      onClick={reset}
                      disabled={busy}
                    >
                      {busy ? "Resetting..." : "Yes, reset"}
                    </Button>

                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full sm:w-auto"
                      onClick={() => setConfirming(false)}
                      disabled={busy}
                    >
                      Cancel
                    </Button>

                  </div>

                </div>

              )}

            </CardContent>
          </Card>
        )}

      </div>

      {/* STATUS / ERROR MESSAGE */}
      {message && (
        <div
          role="status"
          className="min-w-0 break-words rounded-xl border border-violet-100 bg-violet-50 p-3 text-sm leading-relaxed text-violet-900 sm:p-4"
        >
          {message}
        </div>
      )}

    </div>
  );
}