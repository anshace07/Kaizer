"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Square, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";

const MAX_SECONDS = 25; // backend rejects > 28 s, Prisma > 30 s

type Props = {
  disabled?: boolean;
  onAudio: (audio: Blob, filename: string) => void; // called with a finished recording or an uploaded file
};

// Mic button (MediaRecorder) with a timer and live level meter, plus an "Upload audio file" button.
export function VoiceRecorder({ disabled, onAudio }: Props) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [level, setLevel] = useState(0); // 0..1 loudness for the meter
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const cleanupRef = useRef<() => void>(() => {});
  const fileInput = useRef<HTMLInputElement>(null);

  // Stop the mic if the user leaves the page while recording.
  useEffect(() => () => cleanupRef.current(), []);

  async function start() {
    setError(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("Microphone blocked or not found. Allow mic access in the browser, or upload a file.");
      return;
    }

    // Level meter: measure loudness (RMS) of the mic signal ~60 times a second.
    const audioContext = new AudioContext();
    audioContext.resume(); // created after an `await`, so the browser may start it "suspended" (meter stuck at 0)
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 1024;
    audioContext.createMediaStreamSource(stream).connect(analyser);
    const samples = new Float32Array(analyser.fftSize);
    let frame = 0;
    const measure = () => {
      analyser.getFloatTimeDomainData(samples);
      const rms = Math.sqrt(samples.reduce((sum, x) => sum + x * x, 0) / samples.length);
      setLevel(Math.min(1, rms * 4));
      frame = requestAnimationFrame(measure);
    };
    measure();

    // Recorder: browsers record webm/ogg; the backend converts it to WAV with ffmpeg.
    const recorder = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    recorder.onstop = () => {
      cleanupRef.current();
      const type = recorder.mimeType || "audio/webm";
      onAudio(new Blob(chunks, { type }), type.includes("ogg") ? "recording.ogg" : "recording.webm");
    };

    const startedAt = Date.now();
    const timer = setInterval(() => {
      const elapsed = (Date.now() - startedAt) / 1000;
      setSeconds(elapsed);
      if (elapsed >= MAX_SECONDS && recorder.state === "recording") recorder.stop(); // auto-stop
    }, 100);

    cleanupRef.current = () => {
      clearInterval(timer);
      cancelAnimationFrame(frame);
      stream.getTracks().forEach((t) => t.stop());
      audioContext.close();
      setRecording(false);
      setLevel(0);
      cleanupRef.current = () => {};
    };

    recorderRef.current = recorder;
    recorder.start();
    setSeconds(0);
    setRecording(true);
  }

  function stop() {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow picking the same file again
    if (file) onAudio(file, file.name);
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative flex size-56 items-center justify-center">
        {/* Soft lavender disc behind the button, like the mockup */}
        <span className="absolute inset-0 rounded-full bg-gradient-to-b from-violet-100 to-violet-50" />
        {recording && <span className="absolute inset-6 animate-ping rounded-full bg-red-400/30 [animation-duration:1.6s]" />}
        <button
          onClick={recording ? stop : start}
          disabled={disabled}
          aria-label={recording ? "Stop recording" : "Start recording"}
          className={`relative flex size-36 items-center justify-center rounded-full text-white transition-all duration-300 disabled:cursor-not-allowed disabled:opacity-60 ${
            recording
              ? "scale-105 bg-gradient-to-b from-red-500 to-red-600"
              : "pp-mic-glow bg-gradient-to-b from-[#8b6cf6] to-[#5b3bd4] hover:scale-105"
          }`}
          // While recording, the red halo grows with the live mic level.
          style={recording ? { boxShadow: `0 0 0 ${10 + level * 30}px rgba(220,38,38,0.18), 0 12px 40px -8px rgba(220,38,38,0.6)` } : undefined}
        >
          {recording ? <Square className="size-12" fill="currentColor" /> : <Mic className="size-14" />}
        </button>
      </div>

      <p className="mt-1 text-lg font-semibold">{recording ? "Recording… tap to stop" : "Tap to Speak"}</p>

      {recording ? (
        <div className="flex w-64 flex-col items-center gap-1">
          <p className="font-mono text-sm font-medium tabular-nums text-red-600">
            ● {seconds.toFixed(1)} s / {MAX_SECONDS} s
          </p>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-red-100" aria-label="Microphone level">
            <div
              className="h-full rounded-full bg-gradient-to-r from-red-400 to-red-600 transition-[width] duration-75"
              style={{ width: `${Math.max(3, level * 100)}%` }}
            />
          </div>
        </div>
      ) : (
        <p className="text-xs text-slate-500">e.g. &quot;Machine 14 mein smoke aa raha hai&quot; · max {MAX_SECONDS} s</p>
      )}

      <input ref={fileInput} type="file" accept="audio/*,.webm,.m4a,.aac" hidden onChange={onFile} />
      <Button variant="outline" size="sm" disabled={disabled || recording} onClick={() => fileInput.current?.click()}>
        <Upload /> Upload audio file
      </Button>

      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}
