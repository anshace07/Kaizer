"use client";

import { useCallback, useEffect, useState } from "react";

// Calls `load` now and then every `intervalMs`. Returns the latest data, any error, and a manual reload.
export function useAutoRefresh<T>(load: () => Promise<T>, intervalMs = 5000) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(
    () =>
      load().then(
        (result) => {
          setData(result);
          setError(null);
        },
        (e) => setError(e instanceof Error ? e.message : String(e)),
      ),
    [load],
  );

  useEffect(() => {
    // `active` stops an old request (e.g. before a filter changed) from overwriting newer data.
    let active = true;
    const tick = () =>
      load().then(
        (result) => {
          if (!active) return;
          setData(result);
          setError(null);
        },
        (e) => active && setError(e instanceof Error ? e.message : String(e)),
      );
    tick();
    const timer = setInterval(tick, intervalMs);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [load, intervalMs]);

  return { data, error, reload };
}
