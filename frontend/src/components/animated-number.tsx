"use client";

import { useEffect, useRef, useState } from "react";

// Counts smoothly from the previous value to the new one (~600 ms).
// Shows the real number — only the transition is animated.
export function AnimatedNumber({ value }: { value: number }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);

  useEffect(() => {
    const start = from.current;

    if (start === value) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(value);
      from.current = value;
      return;
    }

    const began = performance.now();
    let frame = requestAnimationFrame(function step(now) {
      const t = Math.min(1, (now - began) / 600);
      const eased = 1 - Math.pow(1 - t, 3);

      setShown(Math.round(start + (value - start) * eased));

      if (t < 1) {
        frame = requestAnimationFrame(step);
      } else {
        from.current = value;
      }
    });

    return () => {
      cancelAnimationFrame(frame);
      from.current = value;
    };
  }, [value]);

  return <span className="tabular-nums">{shown}</span>;
}