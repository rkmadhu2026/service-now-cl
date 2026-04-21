import { v4 as uuid } from "uuid";
import type {
  Artifact,
  Decision,
  Incident,
  Job,
  Room,
  StakeholderUpdate,
  Tenant,
  TimelineEvent
} from "./types.js";

type TenantScoped<T extends { tenantId: string }> = Map<string, Map<string, T>>;

export interface Store {
  createTenant(name: string): Promise<Tenant>;
  upsertIncident(incident: Incident): Promise<Incident>;
  getIncident(tenantId: string, incidentId: string): Promise<Incident | undefined>;
  listIncidents(tenantId: string): Promise<Incident[]>;
  saveRoom(room: Room): Promise<Room>;
  saveTimelineEvent(event: TimelineEvent): Promise<TimelineEvent>;
  listTimelineEvents(tenantId: string, incidentId: string): Promise<TimelineEvent[]>;
  saveDecision(decision: Decision): Promise<Decision>;
  listDecisions(tenantId: string, incidentId: string): Promise<Decision[]>;
  saveUpdate(update: StakeholderUpdate): Promise<StakeholderUpdate>;
  listUpdates(tenantId: string, incidentId: string): Promise<StakeholderUpdate[]>;
  saveArtifact(artifact: Artifact): Promise<Artifact>;
  getArtifactByIncident(tenantId: string, incidentId: string): Promise<Artifact | undefined>;
  enqueue(job: Job): Promise<void>;
  dequeue(): Promise<Job | undefined>;
}

export class InMemoryStore implements Store {
  tenants = new Map<string, Tenant>();
  incidents: TenantScoped<Incident> = new Map();
  rooms: TenantScoped<Room> = new Map();
  timelineEvents: TenantScoped<TimelineEvent> = new Map();
  decisions: TenantScoped<Decision> = new Map();
  updates: TenantScoped<StakeholderUpdate> = new Map();
  artifacts: TenantScoped<Artifact> = new Map();
  jobs: Job[] = [];

  private scopedMap<T extends { tenantId: string }>(root: TenantScoped<T>, tenantId: string) {
    if (!root.has(tenantId)) {
      root.set(tenantId, new Map());
    }
    return root.get(tenantId)!;
  }

  async createTenant(name: string): Promise<Tenant> {
    const tenant: Tenant = { id: uuid(), name, createdAt: new Date().toISOString() };
    this.tenants.set(tenant.id, tenant);
    return tenant;
  }

  async upsertIncident(incident: Incident): Promise<Incident> {
    this.scopedMap(this.incidents, incident.tenantId).set(incident.id, incident);
    return incident;
  }

  async getIncident(tenantId: string, incidentId: string): Promise<Incident | undefined> {
    return this.scopedMap(this.incidents, tenantId).get(incidentId);
  }

  async listIncidents(tenantId: string): Promise<Incident[]> {
    return [...this.scopedMap(this.incidents, tenantId).values()];
  }

  async saveRoom(room: Room): Promise<Room> {
    this.scopedMap(this.rooms, room.tenantId).set(room.id, room);
    return room;
  }

  async saveTimelineEvent(event: TimelineEvent): Promise<TimelineEvent> {
    this.scopedMap(this.timelineEvents, event.tenantId).set(event.id, event);
    return event;
  }

  async listTimelineEvents(tenantId: string, incidentId: string): Promise<TimelineEvent[]> {
    return [...this.scopedMap(this.timelineEvents, tenantId).values()]
      .filter((item) => item.incidentId === incidentId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async saveDecision(decision: Decision): Promise<Decision> {
    this.scopedMap(this.decisions, decision.tenantId).set(decision.id, decision);
    return decision;
  }

  async listDecisions(tenantId: string, incidentId: string): Promise<Decision[]> {
    return [...this.scopedMap(this.decisions, tenantId).values()]
      .filter((item) => item.incidentId === incidentId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async saveUpdate(update: StakeholderUpdate): Promise<StakeholderUpdate> {
    this.scopedMap(this.updates, update.tenantId).set(update.id, update);
    return update;
  }

  async listUpdates(tenantId: string, incidentId: string): Promise<StakeholderUpdate[]> {
    return [...this.scopedMap(this.updates, tenantId).values()]
      .filter((item) => item.incidentId === incidentId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async saveArtifact(artifact: Artifact): Promise<Artifact> {
    this.scopedMap(this.artifacts, artifact.tenantId).set(artifact.id, artifact);
    return artifact;
  }

  async getArtifactByIncident(tenantId: string, incidentId: string): Promise<Artifact | undefined> {
    return [...this.scopedMap(this.artifacts, tenantId).values()].find((a) => a.incidentId === incidentId);
  }

  async enqueue(job: Job): Promise<void> {
    this.jobs.push(job);
  }

  async dequeue(): Promise<Job | undefined> {
    return this.jobs.shift();
  }
}
