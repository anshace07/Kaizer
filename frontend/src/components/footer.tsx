"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

// The LLM name comes from the backend's LLM_MODEL env var, so the footer never lies about the model.
export function Footer() {
  const [llm, setLlm] = useState("…");

  useEffect(() => {
    api
      .health()
      .then((h) => setLlm(h.llm_model))
      .catch(() => setLlm("backend offline"));
  }, []);

  return (
    <footer className="border-t bg-white/60 px-8 py-3 text-xs text-slate-500">
      Data: synthetic · STT: Prisma v3.0 · TTS: Timbre · LLM: {llm}
    </footer>
  );
}
