export type Severity = "sev1" | "sev2" | "sev3";
export type IncidentPhase = "investigating" | "mitigating" | "monitoring" | "resolved";
export type Audience = "exec" | "customer" | "internal";

export interface Tenant {
  id: string;
  name: string;
  createdAt: string;
}

export interface Incident {
  id: string;
  tenantId: string;
  externalId: string;
  title: string;
  service: string;
  severity: Severity;
  phase: IncidentPhase;
  elapsedMinutes: number;
  roomId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Room {
  id: string;
  tenantId: string;
  incidentId: string;
  roles: Record<string, string>;
  unresolvedBlockers: string[];
  latestHypothesis: string;
  mitigationPlan: string;
  createdAt: string;
}

export interface TimelineEvent {
  id: string;
  tenantId: string;
  incidentId: string;
  type: string;
  message: string;
  source: "servicenow" | "slack" | "teams" | "relayroom" | "operator";
  createdAt: string;
}

export interface Decision {
  id: string;
  tenantId: string;
  incidentId: string;
  decision: string;
  rationale: string;
  approvedBy: string;
  createdAt: string;
}

export interface StakeholderUpdate {
  id: string;
  tenantId: string;
  incidentId: string;
  audience: Audience;
  content: string;
  createdAt: string;
}

export interface Artifact {
  id: string;
  tenantId: string;
  incidentId: string;
  timeline: TimelineEvent[];
  decisions: Decision[];
  updates: StakeholderUpdate[];
  unresolvedFollowUps: string[];
  generatedAt: string;
}

export interface Job {
  id: string;
  tenantId: string;
  incidentId: string;
  type: "nudge" | "postmortem-package";
  payload: Record<string, string>;
  createdAt: string;
}
