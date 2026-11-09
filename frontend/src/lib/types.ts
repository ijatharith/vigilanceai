// Types for the Vigilance FastAPI backend (/api/v1) and the VIGIL agents
// service contracts it forwards (agents/vigil-agents/vigil/core/models.py).

export type Severity = "critical" | "high" | "medium" | "low";

// ---- System -------------------------------------------------------------

export type ServiceStatus = "connected" | "unavailable" | "not_configured";

export interface ServiceCheck {
  name: string;
  status: ServiceStatus;
  latency_ms: number | null;
  message: string;
  detail: Record<string, unknown>;
}

export interface Health {
  backend: { status: string; version: string };
  overall: "healthy" | "degraded" | "down";
  services: Record<"database" | "wazuh_manager" | "wazuh_indexer" | "vigil_agents", ServiceCheck>;
}

export interface IntegrationSettings {
  wazuh_manager: { url: string | null; verify_tls: boolean; username_configured: boolean; password_configured: boolean };
  wazuh_indexer: { url: string | null; verify_tls: boolean; username_configured: boolean; password_configured: boolean };
  vigil_agents: { url: string | null; token_configured: boolean };
  database: { url: string | null };
  soar: { n8n_configured: boolean; note: string };
  auth: { enabled: boolean; note: string };
  version: string;
}

export interface AuditEvent {
  id: number;
  created_at: string | null;
  actor: string;
  action: string;
  resource: string | null;
  result: "success" | "failure";
  context: Record<string, unknown>;
}

// ---- Dashboard ----------------------------------------------------------

export interface ActivityBucket {
  hour: string;
  critical: number;
  high: number;
  medium: number;
  low: number;
}

export interface DashboardStats {
  total_alerts: number;
  critical_alerts: number;
  high_alerts: number;
  medium_alerts: number;
  low_alerts: number;
  latest_alert_at: string | null;
  top_rules: { rule_id: string | null; description: string | null; count: number }[];
  alerts_by_agent: { agent_id: string | null; agent_name: string | null; count: number }[];
  activity: { window_start: string | null; window_end: string | null; buckets: ActivityBucket[] };
  investigations: { total: number; active: number; completed: number; failed: number; awaiting_review: number };
}

// ---- Alerts -------------------------------------------------------------

export interface StoredAlert {
  alert_id: string;
  timestamp: string | null;
  rule_id: string | null;
  rule_description: string | null;
  level: number | null;
  agent_id: string | null;
  agent_name: string | null;
  agent_ip: string | null;
  source_ip: string | null;
  rule_groups: string[];
  mitre: { id?: string[]; tactic?: string[]; technique?: string[] } | null;
  stored_at: string | null;
}

export interface StoredAlertDetail extends StoredAlert {
  full_event: Record<string, unknown>;
  related: StoredAlert[];
}

/** Raw Wazuh Indexer hit, flattened by the backend (id + index + _source). */
export interface LiveAlert {
  id: string;
  index?: string;
  timestamp?: string;
  rule?: { id?: string; level?: number; description?: string; groups?: string[]; mitre?: StoredAlert["mitre"] };
  agent?: { id?: string; name?: string; ip?: string };
  data?: { srcip?: string; srcuser?: string; dstuser?: string; [k: string]: unknown };
  full_log?: string;
  [k: string]: unknown;
}

// ---- Wazuh endpoints ----------------------------------------------------

export interface WazuhAgent {
  id: string;
  name: string;
  ip?: string;
  registerIP?: string;
  status: "active" | "disconnected" | "never_connected" | "pending" | string;
  os?: { name?: string; version?: string; platform?: string; arch?: string };
  version?: string;
  lastKeepAlive?: string;
  dateAdd?: string;
  disconnection_time?: string;
  group?: string[];
  node_name?: string;
  manager?: string;
  group_config_status?: string;
}

export interface WazuhAgentsResponse {
  data: { affected_items: WazuhAgent[]; total_affected_items: number };
}

// ---- Investigations (VIGIL agents) --------------------------------------

export type RunStatus = "queued" | "running" | "completed" | "partial" | "failed" | "cancelled";
export type Assessment = "suspicious" | "benign" | "unknown" | "inconclusive";
export type ReviewDecision = "findings_accepted" | "findings_rejected" | "escalated";

export interface CaseRow {
  case_id: string;
  origin: "stored_alert" | "live_alert" | "manual";
  alert_id: string | null;
  alert_summary: string | null;
  alert_level: number | null;
  status: RunStatus | string;
  security_assessment: Assessment | null;
  review_decision: ReviewDecision | null;
  review_note: string | null;
  reviewed_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface EvidenceClaim {
  evidence_id: string;
  field_path: string;
  operator: "eq" | "contains" | "gte" | "lte";
  expected_value: unknown;
}

export interface ObservedFact {
  statement: string;
  evidence_ids: string[];
  kind: "verified_observation" | "analyst_hypothesis" | "model_inference" | "recommended_action";
  claims: EvidenceClaim[];
}

export interface Hypothesis {
  statement: string;
  status: string;
  supporting_evidence_ids: string[];
  contradictory_evidence_ids: string[];
}

export interface EvidenceReference {
  evidence_id: string;
  native_event_id: string;
  source_type: string;
}

export interface ToolCallRecord {
  call_id: string;
  tool_name: string;
  arguments: Record<string, unknown>;
  status: string;
  evidence_ids: string[];
  error: string | null;
  duplicate: boolean;
}

export interface AgentResult {
  case_id: string;
  agent_id: string;
  run_id: string;
  run_status: RunStatus;
  security_assessment: Assessment;
  model_provider: string;
  model_id: string;
  observed_facts: ObservedFact[];
  hypotheses: Hypothesis[];
  evidence_refs: EvidenceReference[];
  evidence_gaps: string[];
  tool_calls: ToolCallRecord[];
  recommendations: string[];
  limitations: string[];
  skills_used: string[];
  specialist_results: AgentResult[];
  started_at: string;
  completed_at: string;
  analyst_review_required: boolean;
  response_executed: boolean;
}

export interface InvestigationJob {
  job_id: string;
  status: string;
  attempts: number;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export interface InvestigationStatus {
  case_id: string;
  status: RunStatus;
  created_at: string;
  updated_at: string;
  job: InvestigationJob | null;
  agent_runs: AgentResult[];
  terminal: boolean;
  report_ready: boolean;
}

export interface CaseReport {
  schema_version: string;
  case_id: string;
  status: RunStatus;
  security_assessment: Assessment;
  executive_summary: string;
  timeline: { observed_at: string | null; native_event_id: string; source_type: string }[];
  specialist_results: AgentResult[];
  supported_findings: ObservedFact[];
  unresolved_questions: string[];
  next_steps: string[];
  analyst_review_required: boolean;
  response_executed: boolean;
}

export interface Submission {
  case_id: string;
  status: string;
  poll_url: string;
  created: boolean;
}

export interface AgentInfo {
  agent_id: string;
  display_name: string;
  purpose: string;
  tools: string[];
  skills: string[];
  provider: string;
  model_id: string;
}

export interface Recommendation {
  id: string;
  case_id: string;
  alert_summary: string | null;
  security_assessment: Assessment | null;
  recommendation: string;
  review_decision: ReviewDecision | null;
  response_executed: boolean;
  case_created_at: string | null;
}
