"use client";

// Everything PlantPulse says out loud goes through here.
// - Mute is remembered in localStorage (wrapped in try/catch: private windows can block it).
// - Audio NEVER blocks the flow: failures are swallowed and the text is still shown in the voice toast.
import { API_URL, api, type Speech } from "./api";

const MUTE_KEY = "plantpulse-muted";
type Listener = () => void;

let muted = false;
let loaded = false;
let last: Speech | null = null; // what was said most recently (shown in the toast)
let current: HTMLAudioElement | null = null;
const listeners = new Set<Listener>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    muted = window.localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    muted = false;
  }
}

function notify() {
  listeners.forEach((fn) => fn());
}

export function subscribe(fn: Listener) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function isMuted() {
  load();
  return muted;
}

export function lastSpoken() {
  return last;
}

export function setMuted(value: boolean) {
  muted = value;
  try {
    window.localStorage.setItem(MUTE_KEY, value ? "1" : "0");
  } catch {
    // storage blocked: mute still works for this page view
  }
  if (value) current?.pause();
  notify();
}

export function audioSrc(speech: Speech) {
  return speech.audio_url ? `${API_URL}${speech.audio_url}` : null;
}

/** Show the text and (unless muted) play the audio. Never throws. */
export function play(speech: Speech) {
  last = speech;
  notify();
  const src = audioSrc(speech);
  if (isMuted() || !src) return;
  try {
    current?.pause();
    current = new Audio(src);
    current.play().catch(() => {}); // e.g. autoplay blocked — the text is already on screen
  } catch {
    // no audio support — carry on
  }
}

let lastAsked = { text: "", at: 0 };

/** Ask the backend to speak `text` (Timbre, cached), then play it, showing `display` on screen. Never throws. */
export async function say(text: string, display: string = text) {
  // React dev mode runs effects twice; don't ask for the same sentence twice in a row.
  if (text === lastAsked.text && Date.now() - lastAsked.at < 3000) return;
  lastAsked = { text, at: Date.now() };
  try {
    play({ ...(await api.tts(text)), text: display });
  } catch {
    play({ text: display, audio_url: null, cached: false, tts_ms: null, tts_error: "Voice unavailable" });
  }
}
