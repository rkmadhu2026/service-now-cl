import { v4 as uuid } from "uuid";
import type { Store } from "./store.js";
import type {
  Artifact,
  Audience,
  Decision,
  Incident,
  IncidentPhase,
  Job,
  Severity,
  StakeholderUpdate,
  TimelineEvent
} from "./types.js";

export class RelayroomService {
  constructor(private readonly store: Store) {}
  private enqueueJob: ((job: Job) => Promise<void>) | undefined;

  setQueuePublisher(publisher: (job: Job) => Promise<void>) {
    this.enqueueJob = publisher;
  }

  async createTenant(name: string) {
    return this.store.createTenant(name);
  }

  async ingestServiceNowIncident(params: {
    tenantId: string;
    externalId: string;
    title: string;
    service: string;
    severity: Severity;
    phase?: IncidentPhase;
  }) {
    const now = new Date().toISOString();
    const existing = (await this.store.listIncidents(params.tenantId)).find((i) => i.externalId === params.externalId);

    const incident: Incident = existing
      ? {
          ...existing,
          title: params.title,
          service: params.service,
          severity: params.severity,
          phase: params.phase ?? existing.phase,
          updatedAt: now
        }
      : {
          id: uuid(),
          tenantId: params.tenantId,
          externalId: params.externalId,
          title: params.title,
          service: params.service,
          severity: params.severity,
          phase: params.phase ?? "investigating",
          elapsedMinutes: 0,
          createdAt: now,
          updatedAt: now
        };

    await this.store.upsertIncident(incident);

    await this.createTimelineEvent({
      tenantId: params.tenantId,
      incidentId: incident.id,
      source: "servicenow",
      type: "incident_sync",
      message: `ServiceNow sync: ${incident.externalId} ${incident.severity} ${incident.phase}`
    });

    if (incident.severity === "sev1" && !incident.roomId) {
      const roomId = await this.createRoomForIncident(incident.tenantId, incident.id);
      incident.roomId = roomId;
      await this.store.upsertIncident(incident);
      this.dispatchJob({
        id: uuid(),
        tenantId: incident.tenantId,
        incidentId: incident.id,
        type: "nudge",
        payload: { audience: "comms_lead" },
        createdAt: now
      });
    }

    return incident;
  }

  private async createRoomForIncident(tenantId: string, incidentId: string) {
    const roomId = uuid();
    await this.store.saveRoom({
      id: roomId,
      tenantId,
      incidentId,
      roles: {
        incident_commander: "unassigned",
        comms_lead: "unassigned",
        ops_lead: "unassigned",
        service_owner: "unassigned",
        executive_observer: "unassigned"
      },
      unresolvedBlockers: [],
      latestHypothesis: "Impact still being scoped.",
      mitigationPlan: "Awaiting primary mitigation owner.",
      createdAt: new Date().toISOString()
    });

    await this.createTimelineEvent({
      tenantId,
      incidentId,
      source: "relayroom",
      type: "room_created",
      message: "Relayroom response room auto-created and roles initialized."
    });

    return roomId;
  }

  async createTimelineEvent(params: {
    tenantId: string;
    incidentId: string;
    type: string;
    message: string;
    source: TimelineEvent["source"];
  }) {
    return this.store.saveTimelineEvent({
      id: uuid(),
      tenantId: params.tenantId,
      incidentId: params.incidentId,
      type: params.type,
      message: params.message,
      source: params.source,
      createdAt: new Date().toISOString()
    });
  }

  async ingestSlackEvent(params: { tenantId: string; incidentId: string; user: string; text: string }) {
    return this.createTimelineEvent({
      tenantId: params.tenantId,
      incidentId: params.incidentId,
      type: "chat_message",
      source: "slack",
      message: `${params.user}: ${params.text}`
    });
  }

  async addDecision(params: {
    tenantId: string;
    incidentId: string;
    decision: string;
    rationale: string;
    approvedBy: string;
  }): Promise<Decision> {
    const decision: Decision = {
      id: uuid(),
      tenantId: params.tenantId,
      incidentId: params.incidentId,
      decision: params.decision,
      rationale: params.rationale,
      approvedBy: params.approvedBy,
      createdAt: new Date().toISOString()
    };
    return this.store.saveDecision(decision);
  }

  async generateUpdate(params: { tenantId: string; incidentId: string; audience: Audience }): Promise<StakeholderUpdate> {
    const incident = await this.mustGetIncident(params.tenantId, params.incidentId);
    const timeline = (await this.store.listTimelineEvents(params.tenantId, params.incidentId)).slice(-3);
    const suffix = timeline.map((e) => e.type).join(", ") || "no recent events";
    const templates: Record<Audience, string> = {
      exec: `Exec update: ${incident.title} is ${incident.phase}. Latest signals: ${suffix}.`,
      customer: `Customer-safe update: We are actively mitigating ${incident.service} degradation and will provide the next update soon.`,
      internal: `Internal update: ${incident.title} (${incident.severity}) is ${incident.phase}. Recent activity: ${suffix}.`
    };

    const update: StakeholderUpdate = {
      id: uuid(),
      tenantId: params.tenantId,
      incidentId: params.incidentId,
      audience: params.audience,
      content: templates[params.audience],
      createdAt: new Date().toISOString()
    };
    return this.store.saveUpdate(update);
  }

  async resolveIncident(params: { tenantId: string; incidentId: string }) {
    const incident = await this.mustGetIncident(params.tenantId, params.incidentId);
    incident.phase = "resolved";
    incident.updatedAt = new Date().toISOString();
    await this.store.upsertIncident(incident);

    await this.createTimelineEvent({
      tenantId: params.tenantId,
      incidentId: params.incidentId,
      type: "resolved",
      source: "operator",
      message: "Incident marked resolved by commander."
    });

    const artifact = await this.packageArtifact(params.tenantId, params.incidentId);
    this.dispatchJob({
      id: uuid(),
      tenantId: params.tenantId,
      incidentId: params.incidentId,
      type: "postmortem-package",
      payload: { artifactId: artifact.id },
      createdAt: new Date().toISOString()
    });

    return incident;
  }

  async packageArtifact(tenantId: string, incidentId: string): Promise<Artifact> {
    const artifact: Artifact = {
      id: uuid(),
      tenantId,
      incidentId,
      timeline: await this.store.listTimelineEvents(tenantId, incidentId),
      decisions: await this.store.listDecisions(tenantId, incidentId),
      updates: await this.store.listUpdates(tenantId, incidentId),
      unresolvedFollowUps: ["Validate monitoring threshold", "Confirm customer-facing RCA ownership"],
      generatedAt: new Date().toISOString()
    };
    return this.store.saveArtifact(artifact);
  }

  async listIncidents(tenantId: string) {
    return this.store.listIncidents(tenantId);
  }

  async getIncidentDetails(tenantId: string, incidentId: string) {
    const incident = await this.mustGetIncident(tenantId, incidentId);
    return {
      incident,
      timeline: await this.store.listTimelineEvents(tenantId, incidentId),
      decisions: await this.store.listDecisions(tenantId, incidentId),
      updates: await this.store.listUpdates(tenantId, incidentId),
      artifact: (await this.store.getArtifactByIncident(tenantId, incidentId)) ?? null
    };
  }

  async processNextJob(): Promise<Job | undefined> {
    const job = await this.store.dequeue();
    if (!job) return undefined;

    if (job.type === "nudge") {
      await this.createTimelineEvent({
        tenantId: job.tenantId,
        incidentId: job.incidentId,
        type: "nudge_sent",
        source: "relayroom",
        message: `Role-aware nudge sent to ${job.payload.audience}.`
      });
    }

    if (job.type === "postmortem-package") {
      await this.createTimelineEvent({
        tenantId: job.tenantId,
        incidentId: job.incidentId,
        type: "artifact_ready",
        source: "relayroom",
        message: `Post-incident package ${job.payload.artifactId} ready.`
      });
    }

    return job;
  }

  async pushJob(job: Job) {
    await this.store.enqueue(job);
  }

  async handleExternalJob(job: Job) {
    await this.store.enqueue(job);
    await this.processNextJob();
  }

  private dispatchJob(job: Job) {
    if (this.enqueueJob) {
      void this.enqueueJob(job);
      return;
    }
      void this.store.enqueue(job);
  }

  private async mustGetIncident(tenantId: string, incidentId: string): Promise<Incident> {
    const incident = await this.store.getIncident(tenantId, incidentId);
    if (!incident) {
      throw new Error("Incident not found");
    }
    return incident;
  }
}
