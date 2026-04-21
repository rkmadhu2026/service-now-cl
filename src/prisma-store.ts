import type { PrismaClient } from "@prisma/client";
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
import type { Store } from "./store.js";

const toIncident = (item: {
  id: string;
  tenantId: string;
  externalId: string;
  title: string;
  service: string;
  severity: string;
  phase: string;
  elapsedMinutes: number;
  roomId: string | null;
  createdAt: Date;
  updatedAt: Date;
}): Incident => ({
  ...item,
  severity: item.severity as Incident["severity"],
  phase: item.phase as Incident["phase"],
  roomId: item.roomId ?? undefined,
  createdAt: item.createdAt.toISOString(),
  updatedAt: item.updatedAt.toISOString()
});

export class PrismaStore implements Store {
  private jobs: Job[] = [];

  constructor(private readonly prisma: PrismaClient) {}

  async createTenant(name: string): Promise<Tenant> {
    const tenant = await this.prisma.tenant.create({ data: { name } });
    return { id: tenant.id, name: tenant.name, createdAt: tenant.createdAt.toISOString() };
  }

  async upsertIncident(incident: Incident): Promise<Incident> {
    const saved = await this.prisma.incident.upsert({
      where: { id: incident.id },
      create: {
        id: incident.id,
        tenantId: incident.tenantId,
        externalId: incident.externalId,
        title: incident.title,
        service: incident.service,
        severity: incident.severity,
        phase: incident.phase,
        elapsedMinutes: incident.elapsedMinutes,
        roomId: incident.roomId ?? null,
        createdAt: new Date(incident.createdAt)
      },
      update: {
        title: incident.title,
        service: incident.service,
        severity: incident.severity,
        phase: incident.phase,
        elapsedMinutes: incident.elapsedMinutes,
        roomId: incident.roomId ?? null
      }
    });
    return toIncident(saved);
  }

  async getIncident(tenantId: string, incidentId: string): Promise<Incident | undefined> {
    const incident = await this.prisma.incident.findFirst({ where: { tenantId, id: incidentId } });
    return incident ? toIncident(incident) : undefined;
  }

  async listIncidents(tenantId: string): Promise<Incident[]> {
    const rows = await this.prisma.incident.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" } });
    return rows.map(toIncident);
  }

  async saveRoom(room: Room): Promise<Room> {
    const saved = await this.prisma.room.upsert({
      where: { id: room.id },
      create: {
        id: room.id,
        tenantId: room.tenantId,
        incidentId: room.incidentId,
        roles: room.roles,
        unresolvedBlockers: room.unresolvedBlockers,
        latestHypothesis: room.latestHypothesis,
        mitigationPlan: room.mitigationPlan,
        createdAt: new Date(room.createdAt)
      },
      update: {
        roles: room.roles,
        unresolvedBlockers: room.unresolvedBlockers,
        latestHypothesis: room.latestHypothesis,
        mitigationPlan: room.mitigationPlan
      }
    });
    return {
      id: saved.id,
      tenantId: saved.tenantId,
      incidentId: saved.incidentId,
      roles: saved.roles as Record<string, string>,
      unresolvedBlockers: saved.unresolvedBlockers as string[],
      latestHypothesis: saved.latestHypothesis,
      mitigationPlan: saved.mitigationPlan,
      createdAt: saved.createdAt.toISOString()
    };
  }

  async saveTimelineEvent(event: TimelineEvent): Promise<TimelineEvent> {
    const saved = await this.prisma.timelineEvent.create({
      data: {
        id: event.id,
        tenantId: event.tenantId,
        incidentId: event.incidentId,
        type: event.type,
        message: event.message,
        source: event.source,
        createdAt: new Date(event.createdAt)
      }
    });
    return { ...event, createdAt: saved.createdAt.toISOString() };
  }

  async listTimelineEvents(tenantId: string, incidentId: string): Promise<TimelineEvent[]> {
    const rows = await this.prisma.timelineEvent.findMany({
      where: { tenantId, incidentId },
      orderBy: { createdAt: "asc" }
    });
    return rows.map((row: any) => ({
      id: row.id,
      tenantId: row.tenantId,
      incidentId: row.incidentId,
      type: row.type,
      message: row.message,
      source: row.source as TimelineEvent["source"],
      createdAt: row.createdAt.toISOString()
    }));
  }

  async saveDecision(decision: Decision): Promise<Decision> {
    const saved = await this.prisma.decision.create({
      data: {
        id: decision.id,
        tenantId: decision.tenantId,
        incidentId: decision.incidentId,
        decision: decision.decision,
        rationale: decision.rationale,
        approvedBy: decision.approvedBy,
        createdAt: new Date(decision.createdAt)
      }
    });
    return { ...decision, createdAt: saved.createdAt.toISOString() };
  }

  async listDecisions(tenantId: string, incidentId: string): Promise<Decision[]> {
    const rows = await this.prisma.decision.findMany({
      where: { tenantId, incidentId },
      orderBy: { createdAt: "asc" }
    });
    return rows.map((row: any) => ({
      id: row.id,
      tenantId: row.tenantId,
      incidentId: row.incidentId,
      decision: row.decision,
      rationale: row.rationale,
      approvedBy: row.approvedBy,
      createdAt: row.createdAt.toISOString()
    }));
  }

  async saveUpdate(update: StakeholderUpdate): Promise<StakeholderUpdate> {
    const saved = await this.prisma.stakeholderUpdate.create({
      data: {
        id: update.id,
        tenantId: update.tenantId,
        incidentId: update.incidentId,
        audience: update.audience,
        content: update.content,
        createdAt: new Date(update.createdAt)
      }
    });
    return { ...update, createdAt: saved.createdAt.toISOString() };
  }

  async listUpdates(tenantId: string, incidentId: string): Promise<StakeholderUpdate[]> {
    const rows = await this.prisma.stakeholderUpdate.findMany({
      where: { tenantId, incidentId },
      orderBy: { createdAt: "asc" }
    });
    return rows.map((row: any) => ({
      id: row.id,
      tenantId: row.tenantId,
      incidentId: row.incidentId,
      audience: row.audience as StakeholderUpdate["audience"],
      content: row.content,
      createdAt: row.createdAt.toISOString()
    }));
  }

  async saveArtifact(artifact: Artifact): Promise<Artifact> {
    await this.prisma.artifact.create({
      data: {
        id: artifact.id,
        tenantId: artifact.tenantId,
        incidentId: artifact.incidentId,
        unresolvedFollowUps: artifact.unresolvedFollowUps,
        generatedAt: new Date(artifact.generatedAt)
      }
    });
    return artifact;
  }

  async getArtifactByIncident(tenantId: string, incidentId: string): Promise<Artifact | undefined> {
    const record = await this.prisma.artifact.findFirst({
      where: { tenantId, incidentId },
      orderBy: { generatedAt: "desc" }
    });
    if (!record) return undefined;
    return {
      id: record.id,
      tenantId: record.tenantId,
      incidentId: record.incidentId,
      timeline: await this.listTimelineEvents(tenantId, incidentId),
      decisions: await this.listDecisions(tenantId, incidentId),
      updates: await this.listUpdates(tenantId, incidentId),
      unresolvedFollowUps: record.unresolvedFollowUps as string[],
      generatedAt: record.generatedAt.toISOString()
    };
  }

  async enqueue(job: Job): Promise<void> {
    this.jobs.push(job);
  }

  async dequeue(): Promise<Job | undefined> {
    return this.jobs.shift();
  }
}
