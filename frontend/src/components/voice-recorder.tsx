"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Square, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";

const MAX_SECONDS = 25;

type Props = {
  disabled?: boolean;
  statusText?: string;
  onAudio: (audio: Blob, filename: string) => void;
};

export function VoiceRecorder({
  disabled,
  statusText,
  onAudio,
}: Props) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const cleanupRef = useRef<() => void>(() => {});
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => cleanupRef.current();
  }, []);

  async function start() {
    setError(null);

    let stream: MediaStream;

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
    } catch {
      setError(
        "Microphone blocked or not found. Allow microphone access or upload an audio file."
      );
      return;
    }

    try {
      const audioContext = new AudioContext();
      await audioContext.resume();

      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 1024;

      audioContext.createMediaStreamSource(stream).connect(analyser);

      const samples = new Float32Array(analyser.fftSize);
      let frame = 0;

      const measure = () => {
        analyser.getFloatTimeDomainData(samples);

        const rms = Math.sqrt(
          samples.reduce((sum, x) => sum + x * x, 0) /
            samples.length
        );

        setLevel(Math.min(1, rms * 4));
        frame = requestAnimationFrame(measure);
      };

      measure();

      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size) {
          chunks.push(event.data);
        }
      };

      recorder.onstop = () => {
        cleanupRef.current();

        const type = recorder.mimeType || "audio/webm";

        onAudio(
          new Blob(chunks, { type }),
          type.includes("ogg") ? "recording.ogg" : "recording.webm"
        );
      };

      const startedAt = Date.now();

      const timer = setInterval(() => {
        const elapsed = (Date.now() - startedAt) / 1000;

        setSeconds(elapsed);

        if (
          elapsed >= MAX_SECONDS &&
          recorder.state === "recording"
        ) {
          recorder.stop();
        }
      }, 100);

      cleanupRef.current = () => {
        clearInterval(timer);
        cancelAnimationFrame(frame);

        stream.getTracks().forEach((track) => track.stop());

        void audioContext.close();

        setRecording(false);
        setLevel(0);

        cleanupRef.current = () => {};
      };

      recorderRef.current = recorder;
      recorder.start();

      setSeconds(0);
      setRecording(true);
    } catch {
      stream.getTracks().forEach((track) => track.stop());
      setError("Unable to start recording. Please try again.");
    }
  }

  function stop() {
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
    }
  }

  function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    event.target.value = "";

    if (file) {
      onAudio(file, file.name);
    }
  }

  return (
    <div className="flex w-full flex-col items-center gap-4">

      {/* MICROPHONE BUTTON */}
      <div className="relative flex h-44 w-44 items-center justify-center">

        <span className="absolute inset-0 rounded-full bg-gradient-to-b from-violet-100 to-violet-50" />

        {recording && (
          <span className="absolute inset-3 animate-ping rounded-full bg-red-400/30 [animation-duration:1.6s]" />
        )}

        <button
          type="button"
          onClick={recording ? stop : start}
          disabled={disabled}
          aria-label={recording ? "Stop recording" : "Start recording"}
          className={`relative flex h-28 w-28 items-center justify-center rounded-full text-white transition-all duration-300 disabled:cursor-not-allowed disabled:opacity-60 ${
            recording
              ? "scale-105 bg-gradient-to-b from-red-500 to-red-600"
              : "pp-mic-glow bg-gradient-to-b from-[#8b6cf6] to-[#5b3bd4] hover:scale-105"
          }`}
          style={
            recording
              ? {
                  boxShadow: `0 0 0 ${10 + level * 25}px rgba(220,38,38,0.18), 0 12px 40px -8px rgba(220,38,38,0.6)`,
                }
              : undefined
          }
        >
          {recording ? (
            <Square className="h-10 w-10" fill="currentColor" />
          ) : (
            <Mic className="h-12 w-12" />
          )}
        </button>

      </div>

      {/* STATUS LABEL */}
      <p className="text-lg font-bold text-slate-900">
        {recording
          ? "Recording… tap to stop"
          : statusText ?? "Tap to Speak"}
      </p>

      {/* RECORDING TIMER - VISIBLE ONLY WHILE RECORDING */}
      {recording && (
        <div className="flex w-64 flex-col items-center gap-2">

          <p className="font-mono text-sm font-semibold tabular-nums text-red-600">
            ● {seconds.toFixed(1)} s / {MAX_SECONDS} s
          </p>

          <div className="h-2.5 w-full overflow-hidden rounded-full bg-red-100">
            <div
              className="h-full rounded-full bg-gradient-to-r from-red-400 to-red-600 transition-[width] duration-75"
              style={{
                width: `${Math.max(3, level * 100)}%`,
              }}
            />
          </div>

        </div>
      )}

      {/* AUDIO UPLOAD */}
      <input
        ref={fileInput}
        type="file"
        accept="audio/*,.webm,.m4a,.aac"
        hidden
        onChange={onFile}
      />

      <Button
        variant="outline"
        size="lg"
        disabled={disabled || recording}
        onClick={() => fileInput.current?.click()}
        className="mt-1 rounded-xl border-violet-200 bg-white px-5"
      >
        <Upload className="mr-2 h-4 w-4" />
        Upload audio file
      </Button>

      {/* ERROR */}
      {error && (
        <p className="max-w-md text-center text-sm font-medium text-red-600">
          {error}
        </p>
      )}

    </div>
  );
}