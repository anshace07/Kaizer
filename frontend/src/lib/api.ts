// All calls to the FastAPI backend live here, so pages never build URLs themselves.

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type Severity = "low" | "medium" | "high" | "critical";
export type Status = "open" | "acknowledged" | "in_progress" | "resolved";

export type Machine = {
  id: string;
  name: string;
  type: string;
  location: string;
  aliases: string[];
  next_service_date: string | null;
};

export type Incident = {
  id: string;
  machine_id: string | null;
  location: string | null;
  incident_type: string;
  symptoms: string[];
  transcript: string;
  language: string | null;
  severity: Severity;
  status: Status;
  confidence: number | null; // null until we actually measure it
  related_incident_id: string | null;
  created_at: string;
};

export type IncidentEvent = { timestamp: string; action: string; detail: string };
export type IncidentDetail = Incident & { events: IncidentEvent[] };

export type Stats = {
  total: number;
  unresolved: number;
  critical_unresolved: number;
  by_status: Partial<Record<Status, number>>;
  by_severity: Partial<Record<Severity, number>>;
  unresolved_by_severity: Partial<Record<Severity, number>>;
};

export type Health = { status: string; data: string; stt_model: string; tts_model: string; llm_model: string };

export type Extracted = {
  machine_id: string | null;
  incident_type: string;
  severity: Severity;
  symptoms: string[];
  language: string;
  matched_keywords: string[];
  extractor: string;
};

export type NewIncident = {
  machine_id: string | null;
  incident_type: string;
  severity: Severity;
  symptoms: string[];
  transcript: string;
  language: string | null;
};

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${body}`);
  }
  return res.json();
}

export type Transcription = {
  transcript: string;
  detected_language_code: string | null;
  stt_ms: number; // measured time of the real Prisma call
  cached: boolean;
  audio_seconds: number;
};

// Audio upload is multipart form data, so it can't use the JSON `request` helper.
async function transcribe(audio: Blob, filename: string): Promise<Transcription> {
  const form = new FormData();
  form.append("file", audio, filename);
  const res = await fetch(`${API_URL}/api/transcribe`, { method: "POST", body: form });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail ?? `${res.status} ${res.statusText}`);
  }
  return res.json();
}

export const api = {
  transcribe,
  health: () => request<Health>("/api/health"),
  stats: () => request<Stats>("/api/stats"),
  machines: () => request<Machine[]>("/api/machines"),
  incidents: (filters: { status?: string; severity?: string } = {}) => {
    const params = new URLSearchParams();
    if (filters.status) params.set("status", filters.status);
    if (filters.severity) params.set("severity", filters.severity);
    const query = params.toString();
    return request<Incident[]>(`/api/incidents${query ? `?${query}` : ""}`);
  },
  incident: (id: string) => request<IncidentDetail>(`/api/incidents/${id}`),
  extract: (transcript: string) =>
    request<Extracted>("/api/incidents/extract", { method: "POST", body: JSON.stringify({ transcript }) }),
  createIncident: (body: NewIncident) =>
    request<IncidentDetail>("/api/incidents", { method: "POST", body: JSON.stringify(body) }),
  setStatus: (id: string, status: Status, note = "") =>
    request<IncidentDetail>(`/api/incidents/${id}/status`, {
      method: "POST",
      body: JSON.stringify({ status, note }),
    }),
};
