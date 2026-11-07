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
  escalated: boolean; // a safety rule fired -> simulated alert
  severity_source: string | null; // safety_rule / llm / keyword_fallback / worker
  confidence: number | null; // the LLM's SELF-REPORTED confidence, not measured
  related_incident_id: string | null;
  created_at: string;
};

export type RuleHit = { rule_id: string; rule_name: string; keyword: string; source: string };

export type IncidentEvent = { timestamp: string; action: string; detail: string };
export type IncidentDetail = Incident & {
  llm_severity: string | null;
  extractor: string | null;
  extracted: Analysis | null;
  rule_hits: RuleHit[];
  events: IncidentEvent[];
};

export type Stats = {
  total: number;
  unresolved: number;
  critical_unresolved: number;
  by_status: Partial<Record<Status, number>>;
  by_severity: Partial<Record<Severity, number>>;
  unresolved_by_severity: Partial<Record<Severity, number>>;
};

export type Health = { status: string; data: string; stt_model: string; tts_model: string; llm_model: string };

export type Extraction = {
  machine_id: string | null;
  machine_candidates: string[];
  location: string | null;
  incident_type: string;
  reported_symptoms: string[];
  language: string;
  suggested_severity: Severity | null;
  extraction_confidence: number | null; // self-reported by the LLM
  confirmation_required: boolean;
  confirmation_question: string | null;
};

// Response of POST /api/incidents/extract
export type Analysis = {
  transcript: string;
  extraction: Extraction;
  extractor: string; // "llm:<model>" or "keyword fallback"
  fallback_reason: string | null;
  rule_hits: RuleHit[];
  severity: Severity; // after the safety rules
  severity_decided_by: string;
  llm_ms: number | null;
  analyse_ms: number;
};

export type NewIncident = {
  machine_id: string | null;
  incident_type: string;
  severity: Severity;
  symptoms: string[];
  transcript: string;
  language: string | null;
  analysis: Analysis | null;
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
async function transcribe(audio: Blob, filename: string, language: string): Promise<Transcription> {
  const form = new FormData();
  form.append("file", audio, filename);
  form.append("language", language); // hindi / english / hinglish -> Prisma language_code
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
    request<Analysis>("/api/incidents/extract", { method: "POST", body: JSON.stringify({ transcript }) }),
  createIncident: (body: NewIncident) =>
    request<IncidentDetail>("/api/incidents", { method: "POST", body: JSON.stringify(body) }),
  setStatus: (id: string, status: Status, note = "") =>
    request<IncidentDetail>(`/api/incidents/${id}/status`, {
      method: "POST",
      body: JSON.stringify({ status, note }),
    }),
};
