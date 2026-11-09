"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Siren, X } from "lucide-react";

import { api, type Incident } from "@/lib/api";
import { playAlarmSound } from "@/lib/alarm-sound";
import { typeLabel } from "@/lib/format";

const POLL_MS = 3000;
const SHOW_MS = 20000;

// Watches for NEW open Critical incidents (on any page).
// Simulated — nothing controls machines.
export function AlarmWatcher() {
  const [alarm, setAlarm] = useState<Incident | null>(null);
  const seen = useRef<Set<string> | null>(null);

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
            seen.current = new Set(list.map((i) => i.id));
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
        .catch(() => {});

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
    <div className="sticky top-0 z-30 w-full min-w-0 px-3 pt-3 sm:px-6 sm:pt-4 lg:px-10">
      <div
        role="alert"
        className="pp-alarm-pulse animate-in slide-in-from-top-4 fade-in mx-auto flex w-full max-w-[1360px] min-w-0 flex-col gap-3 rounded-2xl bg-gradient-to-r from-red-600 to-red-500 p-3 text-white duration-500 sm:flex-row sm:items-center sm:gap-4 sm:px-5 sm:py-4"
      >
        {/* ALERT ICON */}
        <span className="flex size-9 shrink-0 items-center justify-center self-start rounded-xl bg-white/15 sm:size-10 sm:self-auto">
          <Siren className="size-5 sm:size-6" />
        </span>

        {/* ALERT DETAILS */}
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-red-100">
            Simulated alert · Critical
          </p>

          <p className="break-words text-sm font-semibold sm:text-base">
            {alarm.machine_id
              ? `Machine ${Number(alarm.machine_id.split("-")[1])}`
              : "Unknown machine"}{" "}
            · {typeLabel(alarm.incident_type)} · {alarm.id}
          </p>
        </div>

        {/* ACTIONS */}
        <div className="flex w-full items-center gap-2 sm:w-auto sm:shrink-0">
          <Link
            href={`/incidents/${alarm.id}`}
            onClick={() => setAlarm(null)}
            className="flex-1 rounded-lg bg-white px-3 py-2 text-center text-sm font-semibold text-red-600 transition-colors hover:bg-red-50 sm:flex-none"
          >
            Open incident
          </Link>

          <button
            type="button"
            onClick={() => setAlarm(null)}
            aria-label="Dismiss alert"
            className="shrink-0 rounded-lg p-2 transition-colors hover:bg-white/15"
          >
            <X className="size-5" />
          </button>
        </div>
      </div>
    </div>
  );
}