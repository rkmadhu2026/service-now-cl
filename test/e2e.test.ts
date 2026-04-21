import request from "supertest";
import { describe, expect, it } from "vitest";
import { buildServer } from "../src/server.js";
import { computeHmacSha256 } from "../src/webhook-signature.js";

describe("Relayroom MVP e2e", () => {
  const signedPost = (
    client: request.SuperTest<request.Test>,
    path: string,
    tenantId: string,
    secret: string,
    payload: Record<string, unknown>
  ) => {
    const raw = JSON.stringify(payload);
    return client
      .post(path)
      .set("x-tenant-id", tenantId)
      .set("x-relayroom-signature", computeHmacSha256(secret, raw))
      .set("content-type", "application/json")
      .send(raw);
  };

  const issueToken = async (client: request.SuperTest<request.Test>, tenantId: string) => {
    const tokenRes = await client.post("/api/auth/token").send({
      subject: "tester",
      tenantId,
      role: "commander"
    });
    return tokenRes.body.token as string;
  };

  const setup = () => {
    const { app, processQueuedJobs } = buildServer();
    return { client: request(app), processQueuedJobs };
  };

  it("creates room automatically for sev1 ServiceNow incident", async () => {
    const { client } = setup();
    const tenant = await client.post("/api/tenants").send({ name: "Acme Infra" });
    const tenantId = tenant.body.id;

    const ingest = await signedPost(client, "/api/webhooks/servicenow/incidents", tenantId, "servicenow-dev-secret", {
      externalId: "INC0012345",
      title: "Payments outage",
      service: "payments-api",
      severity: "sev1",
      phase: "investigating"
    });

    expect(ingest.status).toBe(202);
    expect(ingest.body.roomId).toBeTruthy();
    const token = await issueToken(client, tenantId);

    const details = await client.get(`/api/incidents/${ingest.body.id}`).set("authorization", `Bearer ${token}`);
    expect(details.status).toBe(200);
    expect(details.body.timeline.some((e: { type: string }) => e.type === "room_created")).toBe(true);
  });

  it("keeps incidents isolated by tenant", async () => {
    const { client } = setup();
    const t1 = await client.post("/api/tenants").send({ name: "Tenant One" });
    const t2 = await client.post("/api/tenants").send({ name: "Tenant Two" });

    await signedPost(client, "/api/webhooks/servicenow/incidents", t1.body.id, "servicenow-dev-secret", {
      externalId: "INC100",
      title: "Tenant1 Incident",
      service: "auth",
      severity: "sev2"
    });
    const t2Token = await issueToken(client, t2.body.id);

    const t2List = await client.get("/api/incidents").set("authorization", `Bearer ${t2Token}`);
    expect(t2List.status).toBe(200);
    expect(t2List.body.items).toHaveLength(0);
  });

  it("captures slack events, decisions, updates, and resolution artifact", async () => {
    const { client, processQueuedJobs } = setup();
    const tenant = await client.post("/api/tenants").send({ name: "Fintech Ops" });
    const tenantId = tenant.body.id;

    const ingest = await signedPost(client, "/api/webhooks/servicenow/incidents", tenantId, "servicenow-dev-secret", {
      externalId: "INC555",
      title: "Core API degradation",
      service: "core-api",
      severity: "sev1",
      phase: "mitigating"
    });
    const incidentId = ingest.body.id;
    const token = await issueToken(client, tenantId);

    await signedPost(client, "/api/integrations/slack/events", tenantId, "slack-dev-secret", {
      incidentId,
      user: "ops.lead",
      text: "Rollback approved, executing now."
    });

    await client.post(`/api/incidents/${incidentId}/decisions`).set("authorization", `Bearer ${token}`).send({
      decision: "Rollback to previous stable release",
      rationale: "Error rates doubled after latest deployment",
      approvedBy: "incident.commander"
    });

    const update = await client.post(`/api/incidents/${incidentId}/updates`).set("authorization", `Bearer ${token}`).send({
      audience: "exec"
    });
    expect(update.status).toBe(201);
    expect(update.body.content).toContain("Exec update");

    const resolved = await client.post(`/api/incidents/${incidentId}/resolve`).set("authorization", `Bearer ${token}`).send({});
    expect(resolved.status).toBe(202);
    expect(resolved.body.phase).toBe("resolved");

    await processQueuedJobs();
    await processQueuedJobs();

    const details = await client.get(`/api/incidents/${incidentId}`).set("authorization", `Bearer ${token}`);
    expect(details.body.artifact).toBeTruthy();
    expect(details.body.decisions).toHaveLength(1);
    expect(details.body.timeline.some((e: { type: string }) => e.type === "chat_message")).toBe(true);
  });

  it("rejects unsigned ServiceNow webhook", async () => {
    const { client } = setup();
    const tenant = await client.post("/api/tenants").send({ name: "Unsigned Co" });
    const response = await client.post("/api/webhooks/servicenow/incidents").set("x-tenant-id", tenant.body.id).send({
      externalId: "INC999",
      title: "Unsigned payload",
      service: "core",
      severity: "sev1"
    });
    expect(response.status).toBe(401);
  });
});
