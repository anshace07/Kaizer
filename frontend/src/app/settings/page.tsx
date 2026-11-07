"use client";

import { useEffect, useState } from "react";
import { Cpu, RotateCcw, ShieldAlert } from "lucide-react";
import { api, type Health } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// Only in `next dev` AND when the backend has ALLOW_DEMO_RESET=true.
const IS_DEV = process.env.NODE_ENV === "development";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b py-2.5 text-sm last:border-0">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

export default function SettingsPage() {
  const [health, setHealth] = useState<Health | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    api.health().then(setHealth).catch((e) => setMessage(String(e)));
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
    <div className="space-y-6">
      <div>
        <h1 className="text-[28px] font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-slate-500">Models in use and demo tools. All data is synthetic.</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Cpu className="size-4 text-[#6d4ae8]" /> Models
            </CardTitle>
          </CardHeader>
          <CardContent>
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
                {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-6 w-full" />)}
              </div>
            )}
          </CardContent>
        </Card>

        {IS_DEV && health?.demo_reset_enabled && (
          <Card className="border-amber-200">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <RotateCcw className="size-4 text-amber-600" /> Reset demo (dev only)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-slate-600">
                Deletes <b>every</b> incident (including ones you created) and restores the clean seed data: 6 past
                incidents, 16 machines and the open tickets. Use it before recording a demo. This cannot be undone.
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
