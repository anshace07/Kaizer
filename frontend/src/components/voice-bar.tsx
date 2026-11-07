"use client";

import { useSyncExternalStore } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { isMuted, lastSpoken, setMuted, subscribe } from "@/lib/voice";

// Header strip: mute toggle + the last thing PlantPulse said (so the text is visible even if audio fails).
export function VoiceBar() {
  const muted = useSyncExternalStore(subscribe, isMuted, () => false);
  const spoken = useSyncExternalStore(subscribe, lastSpoken, () => null);

  return (
    <div className="flex items-center justify-end gap-3 border-b bg-white/70 px-8 py-2">
      {spoken && (
        <p className="min-w-0 flex-1 truncate text-sm text-slate-600" title={spoken.text}>
          <span className="mr-1">🔊</span>
          {spoken.text}
          {spoken.tts_error && <span className="ml-2 text-xs text-amber-700">(voice unavailable: {spoken.tts_error})</span>}
          {muted && !spoken.tts_error && <span className="ml-2 text-xs text-slate-400">(muted)</span>}
        </p>
      )}
      <button
        onClick={() => setMuted(!muted)}
        aria-pressed={muted}
        className="flex shrink-0 items-center gap-1.5 rounded-md border bg-white px-3 py-1 text-xs text-slate-700 hover:bg-slate-50"
      >
        {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4 text-[#6d4ae8]" />}
        {muted ? "Voice off" : "Voice on"}
      </button>
    </div>
  );
}
