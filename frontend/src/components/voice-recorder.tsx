"use client";

import { useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { Mic, Square, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";

const MAX_SECONDS = 25;

export type AudioSource = "voice" | "upload";

type Props = {
  disabled?: boolean;
  statusText?: string;
  onAudio: (
    audio: Blob,
    filename: string,
    source: AudioSource
  ) => void;
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
    return () => {
      if (recorderRef.current?.state === "recording") {
        recorderRef.current.stop();
      }

      cleanupRef.current();
    };
  }, []);

  async function start() {
    setError(null);

    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      setError(
        "Audio recording is not supported in this browser. Please upload an audio file."
      );
      return;
    }

    let stream: MediaStream;
    let audioContext: AudioContext | null = null;

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
      audioContext = new AudioContext();
      await audioContext.resume();

      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 1024;

      audioContext
        .createMediaStreamSource(stream)
        .connect(analyser);

      const samples = new Float32Array(analyser.fftSize);

      let frame = 0;

      const measure = () => {
        analyser.getFloatTimeDomainData(samples);

        const rms = Math.sqrt(
          samples.reduce((sum, value) => sum + value * value, 0) /
            samples.length
        );

        setLevel(Math.min(1, rms * 4));

        frame = requestAnimationFrame(measure);
      };

      measure();

      const mimeType = MediaRecorder.isTypeSupported(
        "audio/webm;codecs=opus"
      )
        ? "audio/webm;codecs=opus"
        : "";

      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      const chunks: Blob[] = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      const startedAt = Date.now();

      const timer = window.setInterval(() => {
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

        if (audioContext && audioContext.state !== "closed") {
          void audioContext.close();
        }
      };

      recorder.onstop = () => {
        cleanupRef.current();
        cleanupRef.current = () => {};

        setRecording(false);
        setLevel(0);
        setSeconds(0);

        const type = recorder.mimeType || "audio/webm";

        const extension = type.includes("ogg")
          ? "ogg"
          : type.includes("mp4")
            ? "m4a"
            : "webm";

        if (chunks.length === 0) {
          setError("No audio was captured. Please try recording again.");
          return;
        }

        onAudio(
          new Blob(chunks, { type }),
          `recording.${extension}`,
          "voice"
        );
      };

      recorder.onerror = () => {
        cleanupRef.current();
        cleanupRef.current = () => {};

        setRecording(false);
        setLevel(0);
        setSeconds(0);

        setError("Recording failed. Please try again.");
      };

      recorderRef.current = recorder;

      recorder.start();

      setSeconds(0);
      setRecording(true);
    } catch {
      stream.getTracks().forEach((track) => track.stop());

      if (audioContext && audioContext.state !== "closed") {
        void audioContext.close();
      }

      setRecording(false);
      setLevel(0);

      setError("Unable to start recording. Please try again.");
    }
  }

  function stop() {
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
    }
  }

  function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    event.target.value = "";

    if (!file) return;

    setError(null);

    onAudio(file, file.name, "upload");
  }

  return (
    <div className="flex w-full min-w-0 flex-col items-center gap-4">

      {/* MICROPHONE BUTTON */}
      <div className="relative flex h-36 w-36 items-center justify-center sm:h-44 sm:w-44">

        <span className="absolute inset-0 rounded-full bg-gradient-to-b from-violet-100 to-violet-50" />

        {recording && (
          <span className="absolute inset-3 animate-ping rounded-full bg-red-400/30 [animation-duration:1.6s]" />
        )}

        <button
          type="button"
          onClick={recording ? stop : start}
          disabled={disabled}
          aria-label={recording ? "Stop recording" : "Start recording"}
          aria-pressed={recording}
          className={`relative flex h-24 w-24 touch-manipulation items-center justify-center rounded-full text-white transition-all duration-300 disabled:cursor-not-allowed disabled:opacity-60 sm:h-28 sm:w-28 ${
            recording
              ? "scale-105 bg-gradient-to-b from-red-500 to-red-600"
              : "pp-mic-glow bg-gradient-to-b from-[#8b6cf6] to-[#5b3bd4] hover:scale-105"
          }`}
          style={
            recording
              ? {
                  boxShadow: `0 0 0 ${
                    10 + level * 25
                  }px rgba(220,38,38,0.18), 0 12px 40px -8px rgba(220,38,38,0.6)`,
                }
              : undefined
          }
        >
          {recording ? (
            <Square className="h-8 w-8 sm:h-10 sm:w-10" fill="currentColor" />
          ) : (
            <Mic className="h-10 w-10 sm:h-12 sm:w-12" />
          )}
        </button>

      </div>

      {/* STATUS */}
      <p
        aria-live="polite"
        className="max-w-full break-words px-2 text-center text-base font-bold text-slate-900 sm:text-lg"
      >
        {recording
          ? "Recording… tap to stop"
          : statusText ?? "Tap to Speak"}
      </p>

      {/* RECORDING TIMER */}
      {recording && (
        <div className="flex w-full max-w-64 flex-col items-center gap-2 px-2">

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
        className="mt-1 w-full max-w-xs touch-manipulation rounded-xl border-violet-200 bg-white px-5 sm:w-auto"
      >
        <Upload className="mr-2 h-4 w-4 shrink-0" />
        Upload audio file
      </Button>

      {/* ERROR */}
      {error && (
        <p
          role="alert"
          className="w-full max-w-md break-words px-2 text-center text-sm font-medium leading-relaxed text-red-600"
        >
          {error}
        </p>
      )}

    </div>
  );
}