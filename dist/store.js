import { v4 as uuid } from "uuid";
export class InMemoryStore {
    tenants = new Map();
    incidents = new Map();
    rooms = new Map();
    timelineEvents = new Map();
    decisions = new Map();
    updates = new Map();
    artifacts = new Map();
    jobs = [];
    scopedMap(root, tenantId) {
        if (!root.has(tenantId)) {
            root.set(tenantId, new Map());
        }
        return root.get(tenantId);
    }
    async createTenant(name) {
        const tenant = { id: uuid(), name, createdAt: new Date().toISOString() };
        this.tenants.set(tenant.id, tenant);
        return tenant;
    }
    async upsertIncident(incident) {
        this.scopedMap(this.incidents, incident.tenantId).set(incident.id, incident);
        return incident;
    }
    async getIncident(tenantId, incidentId) {
        return this.scopedMap(this.incidents, tenantId).get(incidentId);
    }
    async listIncidents(tenantId) {
        return [...this.scopedMap(this.incidents, tenantId).values()];
    }
    async saveRoom(room) {
        this.scopedMap(this.rooms, room.tenantId).set(room.id, room);
        return room;
    }
    async saveTimelineEvent(event) {
        this.scopedMap(this.timelineEvents, event.tenantId).set(event.id, event);
        return event;
    }
    async listTimelineEvents(tenantId, incidentId) {
        return [...this.scopedMap(this.timelineEvents, tenantId).values()]
            .filter((item) => item.incidentId === incidentId)
            .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    }
    async saveDecision(decision) {
        this.scopedMap(this.decisions, decision.tenantId).set(decision.id, decision);
        return decision;
    }
    async listDecisions(tenantId, incidentId) {
        return [...this.scopedMap(this.decisions, tenantId).values()]
            .filter((item) => item.incidentId === incidentId)
            .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    }
    async saveUpdate(update) {
        this.scopedMap(this.updates, update.tenantId).set(update.id, update);
        return update;
    }
    async listUpdates(tenantId, incidentId) {
        return [...this.scopedMap(this.updates, tenantId).values()]
            .filter((item) => item.incidentId === incidentId)
            .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    }
    async saveArtifact(artifact) {
        this.scopedMap(this.artifacts, artifact.tenantId).set(artifact.id, artifact);
        return artifact;
    }
    async getArtifactByIncident(tenantId, incidentId) {
        return [...this.scopedMap(this.artifacts, tenantId).values()].find((a) => a.incidentId === incidentId);
    }
    async enqueue(job) {
        this.jobs.push(job);
    }
    async dequeue() {
        return this.jobs.shift();
    }
}
