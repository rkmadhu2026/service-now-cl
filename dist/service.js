import { v4 as uuid } from "uuid";
export class RelayroomService {
    store;
    constructor(store) {
        this.store = store;
    }
    enqueueJob;
    setQueuePublisher(publisher) {
        this.enqueueJob = publisher;
    }
    async createTenant(name) {
        return this.store.createTenant(name);
    }
    async ingestServiceNowIncident(params) {
        const now = new Date().toISOString();
        const existing = (await this.store.listIncidents(params.tenantId)).find((i) => i.externalId === params.externalId);
        const incident = existing
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
    async createRoomForIncident(tenantId, incidentId) {
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
    async createTimelineEvent(params) {
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
    async ingestSlackEvent(params) {
        return this.createTimelineEvent({
            tenantId: params.tenantId,
            incidentId: params.incidentId,
            type: "chat_message",
            source: "slack",
            message: `${params.user}: ${params.text}`
        });
    }
    async addDecision(params) {
        const decision = {
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
    async generateUpdate(params) {
        const incident = await this.mustGetIncident(params.tenantId, params.incidentId);
        const timeline = (await this.store.listTimelineEvents(params.tenantId, params.incidentId)).slice(-3);
        const suffix = timeline.map((e) => e.type).join(", ") || "no recent events";
        const templates = {
            exec: `Exec update: ${incident.title} is ${incident.phase}. Latest signals: ${suffix}.`,
            customer: `Customer-safe update: We are actively mitigating ${incident.service} degradation and will provide the next update soon.`,
            internal: `Internal update: ${incident.title} (${incident.severity}) is ${incident.phase}. Recent activity: ${suffix}.`
        };
        const update = {
            id: uuid(),
            tenantId: params.tenantId,
            incidentId: params.incidentId,
            audience: params.audience,
            content: templates[params.audience],
            createdAt: new Date().toISOString()
        };
        return this.store.saveUpdate(update);
    }
    async resolveIncident(params) {
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
    async packageArtifact(tenantId, incidentId) {
        const artifact = {
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
    async listIncidents(tenantId) {
        return this.store.listIncidents(tenantId);
    }
    async getIncidentDetails(tenantId, incidentId) {
        const incident = await this.mustGetIncident(tenantId, incidentId);
        return {
            incident,
            timeline: await this.store.listTimelineEvents(tenantId, incidentId),
            decisions: await this.store.listDecisions(tenantId, incidentId),
            updates: await this.store.listUpdates(tenantId, incidentId),
            artifact: (await this.store.getArtifactByIncident(tenantId, incidentId)) ?? null
        };
    }
    async processNextJob() {
        const job = await this.store.dequeue();
        if (!job)
            return undefined;
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
    async pushJob(job) {
        await this.store.enqueue(job);
    }
    async handleExternalJob(job) {
        await this.store.enqueue(job);
        await this.processNextJob();
    }
    dispatchJob(job) {
        if (this.enqueueJob) {
            void this.enqueueJob(job);
            return;
        }
        void this.store.enqueue(job);
    }
    async mustGetIncident(tenantId, incidentId) {
        const incident = await this.store.getIncident(tenantId, incidentId);
        if (!incident) {
            throw new Error("Incident not found");
        }
        return incident;
    }
}
