"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Siren, X } from "lucide-react";
import { api, type Incident } from "@/lib/api";
import { playAlarmSound } from "@/lib/alarm-sound";
import { typeLabel } from "@/lib/format";

const POLL_MS = 3000;
const SHOW_MS = 20000;

// Watches for NEW open Critical incidents (on any page). When one appears: a full-width red banner slides in,
// pulses softly, and a short alert sound plays (unless voice is off). Simulated — nothing controls machines.
export function AlarmWatcher() {
  const [alarm, setAlarm] = useState<Incident | null>(null);
  const seen = useRef<Set<string> | null>(null); // null until the first load = the starting point

  useEffect(() => {
    let active = true;
    let hideTimer: ReturnType<typeof setTimeout> | undefined;
    const check = () =>
      api
        .incidents({ severity: "critical" })
        .then((list) => {
          if (!active) return;
          const open = list.filter((i) => i.status !== "resolved");
          if (seen.current === null) {
            seen.current = new Set(list.map((i) => i.id)); // existing incidents never ring
            return;
          }
          const fresh = open.find((i) => !seen.current!.has(i.id));
          list.forEach((i) => seen.current!.add(i.id));
          if (fresh) {
            setAlarm(fresh);
            playAlarmSound();
            clearTimeout(hideTimer);
            hideTimer = setTimeout(() => setAlarm(null), SHOW_MS);
          }
        })
        .catch(() => {}); // backend offline: pages show their own error
    check();
    const timer = setInterval(check, POLL_MS);
    return () => {
      active = false;
      clearInterval(timer);
      clearTimeout(hideTimer);
    };
  }, []);

  if (!alarm) return null;
  return (
    <div className="sticky top-0 z-30 px-10 pt-4">
      <div
        role="alert"
        className="pp-alarm-pulse animate-in slide-in-from-top-4 fade-in mx-auto flex max-w-[1360px] items-center gap-4 rounded-2xl bg-gradient-to-r from-red-600 to-red-500 px-5 py-4 text-white duration-500"
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/15">
          <Siren className="size-6" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-red-100">Simulated alert · Critical</p>
          <p className="truncate text-base font-semibold">
            {alarm.machine_id ? `Machine ${Number(alarm.machine_id.split("-")[1])}` : "Unknown machine"} ·{" "}
            {typeLabel(alarm.incident_type)} · {alarm.id}
          </p>
        </div>
        <Link
          href={`/incidents/${alarm.id}`}
          onClick={() => setAlarm(null)}
          className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-red-600 hover:bg-red-50"
        >
          Open incident
        </Link>
        <button onClick={() => setAlarm(null)} aria-label="Dismiss alert" className="rounded-lg p-1.5 hover:bg-white/15">
          <X className="size-5" />
        </button>
      </div>
    </div>
  );
}
