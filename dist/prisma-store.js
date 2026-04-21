const toIncident = (item) => ({
    ...item,
    severity: item.severity,
    phase: item.phase,
    roomId: item.roomId ?? undefined,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString()
});
export class PrismaStore {
    prisma;
    jobs = [];
    constructor(prisma) {
        this.prisma = prisma;
    }
    async createTenant(name) {
        const tenant = await this.prisma.tenant.create({ data: { name } });
        return { id: tenant.id, name: tenant.name, createdAt: tenant.createdAt.toISOString() };
    }
    async upsertIncident(incident) {
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
    async getIncident(tenantId, incidentId) {
        const incident = await this.prisma.incident.findFirst({ where: { tenantId, id: incidentId } });
        return incident ? toIncident(incident) : undefined;
    }
    async listIncidents(tenantId) {
        const rows = await this.prisma.incident.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" } });
        return rows.map(toIncident);
    }
    async saveRoom(room) {
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
            roles: saved.roles,
            unresolvedBlockers: saved.unresolvedBlockers,
            latestHypothesis: saved.latestHypothesis,
            mitigationPlan: saved.mitigationPlan,
            createdAt: saved.createdAt.toISOString()
        };
    }
    async saveTimelineEvent(event) {
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
    async listTimelineEvents(tenantId, incidentId) {
        const rows = await this.prisma.timelineEvent.findMany({
            where: { tenantId, incidentId },
            orderBy: { createdAt: "asc" }
        });
        return rows.map((row) => ({
            id: row.id,
            tenantId: row.tenantId,
            incidentId: row.incidentId,
            type: row.type,
            message: row.message,
            source: row.source,
            createdAt: row.createdAt.toISOString()
        }));
    }
    async saveDecision(decision) {
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
    async listDecisions(tenantId, incidentId) {
        const rows = await this.prisma.decision.findMany({
            where: { tenantId, incidentId },
            orderBy: { createdAt: "asc" }
        });
        return rows.map((row) => ({
            id: row.id,
            tenantId: row.tenantId,
            incidentId: row.incidentId,
            decision: row.decision,
            rationale: row.rationale,
            approvedBy: row.approvedBy,
            createdAt: row.createdAt.toISOString()
        }));
    }
    async saveUpdate(update) {
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
    async listUpdates(tenantId, incidentId) {
        const rows = await this.prisma.stakeholderUpdate.findMany({
            where: { tenantId, incidentId },
            orderBy: { createdAt: "asc" }
        });
        return rows.map((row) => ({
            id: row.id,
            tenantId: row.tenantId,
            incidentId: row.incidentId,
            audience: row.audience,
            content: row.content,
            createdAt: row.createdAt.toISOString()
        }));
    }
    async saveArtifact(artifact) {
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
    async getArtifactByIncident(tenantId, incidentId) {
        const record = await this.prisma.artifact.findFirst({
            where: { tenantId, incidentId },
            orderBy: { generatedAt: "desc" }
        });
        if (!record)
            return undefined;
        return {
            id: record.id,
            tenantId: record.tenantId,
            incidentId: record.incidentId,
            timeline: await this.listTimelineEvents(tenantId, incidentId),
            decisions: await this.listDecisions(tenantId, incidentId),
            updates: await this.listUpdates(tenantId, incidentId),
            unresolvedFollowUps: record.unresolvedFollowUps,
            generatedAt: record.generatedAt.toISOString()
        };
    }
    async enqueue(job) {
        this.jobs.push(job);
    }
    async dequeue() {
        return this.jobs.shift();
    }
}
