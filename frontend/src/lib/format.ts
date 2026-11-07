// Small display helpers: labels, dates, shift.

export const SEVERITIES = ["critical", "high", "medium", "low"] as const;
export const STATUSES = ["open", "acknowledged", "in_progress", "resolved"] as const;

export const INCIDENT_TYPES: Record<string, string> = {
  smoke: "Smoke",
  gas_leak: "Gas leak",
  sparks_fire: "Sparks / fire",
  vibration: "Vibration",
  noise: "Noise",
  oil_leak: "Oil leak",
  overheating: "Overheating",
  other: "Other",
};

// Who decided the final severity (backend `severity_source`).
export const DECIDED_BY: Record<string, string> = {
  safety_rule: "Safety rule",
  llm: "LLM suggestion",
  keyword_fallback: "Keyword fallback (LLM unavailable)",
  worker: "Worker (edited on confirm screen)",
  default: "Default (no suggestion)",
  "seed data": "Seed data",
  "before Phase 4": "Saved before safety rules existed",
};

export const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  acknowledged: "Acknowledged",
  in_progress: "In Progress",
  resolved: "Resolved",
};

export function typeLabel(type: string) {
  return INCIDENT_TYPES[type] ?? type;
}

export function capitalize(text: string | null | undefined) {
  if (!text) return "—";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// The backend stores UTC but SQLite drops the "Z", so add it back before parsing.
export function parseDate(value: string) {
  const hasZone = /Z$|[+-]\d\d:\d\d$/.test(value);
  return new Date(hasZone ? value : value + "Z");
}

export function formatTime(value: string) {
  return parseDate(value).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

export function formatDateTime(value: string) {
  return parseDate(value).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// The LLM's SELF-REPORTED confidence (not measured accuracy). "—" when there is none.
export function formatConfidence(value: number | null | undefined) {
  return value == null ? "—" : `${Math.round(value * 100)}%`;
}

export function greeting(now: Date) {
  const h = now.getHours();
  if (h < 12) return "Good Morning";
  if (h < 17) return "Good Afternoon";
  return "Good Evening";
}

// Three 8-hour shifts (synthetic plant schedule).
export function currentShift(now: Date) {
  const h = now.getHours();
  if (h >= 6 && h < 14) return "Day Shift (6 AM – 2 PM)";
  if (h >= 14 && h < 22) return "Evening Shift (2 PM – 10 PM)";
  return "Night Shift (10 PM – 6 AM)";
}
