"use client";

import { useEffect, useState } from "react";
import { Cpu, RotateCcw, Settings, ShieldAlert } from "lucide-react";

import { api, type Health } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// Only in `next dev` AND when the backend has ALLOW_DEMO_RESET=true.
const IS_DEV = process.env.NODE_ENV === "development";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-slate-100 py-3 text-sm last:border-0">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-semibold text-slate-900">{value}</span>
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
  const colors = tone === "amber" ? "bg-amber-100 text-amber-700" : "bg-violet-100 text-violet-700";
  return (
    <div className="mb-5 flex items-center gap-3">
      <div className={`rounded-xl p-2.5 ${colors}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <h2 className="text-lg font-bold tracking-tight text-slate-900">{title}</h2>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>
    </div>
  );
}

// Settings shows only real things: the models the backend is actually using,
// and (in dev) a button to restore the clean synthetic seed data.
export default function SettingsPage() {
  const [health, setHealth] = useState<Health | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    api.health().then(setHealth).catch((e) => setMessage(e instanceof Error ? e.message : String(e)));
  }, []);

  async function reset() {
    setBusy(true);
    try {
      const r = await api.resetDemo();
      setMessage(`Demo reset: ${r.incidents} seed incidents and ${r.machines} machines restored.`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <div className="min-h-full space-y-7">
      {/* HEADER */}
      <div>
        <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-700">
          <Settings className="h-3.5 w-3.5" />
          SYSTEM CONFIGURATION
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Settings</h1>
        <p className="mt-2 text-sm text-slate-500">Models in use and demo tools. All data is synthetic.</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* MODELS */}
        <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <CardContent className="p-5 sm:p-6">
            <SectionHeading icon={Cpu} title="Models" description="Read live from the backend (/api/health)." />
            {health ? (
              <>
                <Row label="Speech-to-text" value={`Gnani Prisma (${health.stt_model})`} />
                <Row label="Text-to-speech" value={`Gnani Timbre (${health.tts_model}), voice ${health.tts_voice}`} />
                <Row label="LLM" value={health.llm_model} />
                <Row label="LLM if rate-limited" value={health.llm_fallback_model ?? "none (keyword fallback)"} />
                <Row label="LLM request limit" value={`${health.llm_max_rpm} per minute`} />
                <Row label="Data" value={health.data} />
              </>
            ) : (
              <div className="space-y-3">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-6 w-full" />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* RESET DEMO (dev only) */}
        {IS_DEV && health?.demo_reset_enabled && (
          <Card className="rounded-2xl border border-amber-200 bg-white shadow-sm">
            <CardContent className="space-y-4 p-5 sm:p-6">
              <SectionHeading
                icon={RotateCcw}
                title="Reset demo (dev only)"
                description="Restore the clean synthetic seed data."
                tone="amber"
              />
              <p className="text-sm text-slate-600">
                Deletes <b>every</b> incident (including ones you created) and restores the clean seed data. Use it
                before recording a demo. This cannot be undone.
              </p>
              {!confirming ? (
                <Button variant="outline" onClick={() => setConfirming(true)} disabled={busy}>
                  <RotateCcw /> Reset demo
                </Button>
              ) : (
                <div className="flex flex-wrap items-center gap-2 rounded-xl bg-amber-50 p-3">
                  <ShieldAlert className="size-4 text-amber-700" />
                  <span className="text-sm text-amber-900">Wipe all incidents and reseed?</span>
                  <Button size="sm" className="bg-red-600 hover:bg-red-700" onClick={reset} disabled={busy}>
                    Yes, reset
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setConfirming(false)} disabled={busy}>
                    Cancel
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {message && <p className="rounded-xl bg-violet-50 p-4 text-sm text-violet-900">{message}</p>}
    </div>
  );
}
