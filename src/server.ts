import cors from "cors";
import express from "express";
import type { Request } from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { requireAuth, signAccessToken } from "./auth.js";
import { config } from "./config.js";
import { createQueue } from "./queue.js";
import { getPrismaClient } from "./prisma.js";
import { PrismaStore } from "./prisma-store.js";
import { RelayroomService } from "./service.js";
import { InMemoryStore } from "./store.js";
import { hasValidSignature } from "./webhook-signature.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const tenantHeaderSchema = z.string().uuid();

export function buildServer() {
  const app = express();
  const store = config.usePrisma ? new PrismaStore(getPrismaClient()) : new InMemoryStore();
  const service = new RelayroomService(store);
  const queue = createQueue(config.redisUrl, service);
  service.setQueuePublisher((job) => queue.add(job));

  app.use(cors());
  app.use(
    express.json({
      verify: (req, _res, buf) => {
        (req as Request).rawBody = Buffer.from(buf);
      }
    })
  );
  app.use(express.static(path.join(__dirname, "..", "public")));

  // Frontend routes
  app.get("/", (_req, res) => {
    // #region agent log
    fetch("http://127.0.0.1:7604/ingest/492871f3-3967-48e7-a66a-f15499571c9d", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "22a606" },
      body: JSON.stringify({
        sessionId: "22a606",
        runId: "ui-repro",
        hypothesisId: "H2",
        location: "src/server.ts:40",
        message: "Landing route served",
        data: { route: "/" },
        timestamp: Date.now()
      })
    }).catch(() => {});
    // #endregion
    return res.sendFile(path.join(__dirname, "..", "public", "landing.html"));
  });
  app.get("/auth", (_req, res) => {
    // #region agent log
    fetch("http://127.0.0.1:7604/ingest/492871f3-3967-48e7-a66a-f15499571c9d", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "22a606" },
      body: JSON.stringify({
        sessionId: "22a606",
        runId: "ui-repro",
        hypothesisId: "H2",
        location: "src/server.ts:56",
        message: "Auth route served",
        data: { route: "/auth" },
        timestamp: Date.now()
      })
    }).catch(() => {});
    // #endregion
    return res.sendFile(path.join(__dirname, "..", "public", "auth.html"));
  });
  app.get("/app", (_req, res) => {
    // #region agent log
    fetch("http://127.0.0.1:7604/ingest/492871f3-3967-48e7-a66a-f15499571c9d", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "22a606" },
      body: JSON.stringify({
        sessionId: "22a606",
        runId: "ui-repro",
        hypothesisId: "H2",
        location: "src/server.ts:72",
        message: "App route served",
        data: { route: "/app" },
        timestamp: Date.now()
      })
    }).catch(() => {});
    // #endregion
    return res.sendFile(path.join(__dirname, "..", "public", "app.html"));
  });

  app.get("/health", (_req, res) => res.json({ status: "ok" }));

  app.post("/api/auth/token", (req, res) => {
    const bodySchema = z.object({
      subject: z.string().min(2),
      tenantId: z.string().uuid(),
      role: z.enum(["admin", "commander", "responder", "observer"])
    });
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      // #region agent log
      fetch("http://127.0.0.1:7604/ingest/492871f3-3967-48e7-a66a-f15499571c9d", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "22a606" },
        body: JSON.stringify({
          sessionId: "22a606",
          runId: "ui-repro",
          hypothesisId: "H3",
          location: "src/server.ts:89",
          message: "Token request validation failed",
          data: { hasTenantId: Boolean(req.body?.tenantId), role: req.body?.role },
          timestamp: Date.now()
        })
      }).catch(() => {});
      // #endregion
      return res.status(400).json({ error: parsed.error.flatten() });
    }
    const token = signAccessToken({
      sub: parsed.data.subject,
      tenantId: parsed.data.tenantId,
      role: parsed.data.role
    });
    return res.json({ token });
  });

  app.post("/api/tenants", async (req, res) => {
    const bodySchema = z.object({ name: z.string().min(2) });
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    return res.status(201).json(await service.createTenant(parsed.data.name));
  });

  app.use("/api/incidents", requireAuth);

  app.get("/api/incidents", async (req, res) => {
    if (!req.auth) {
      // #region agent log
      fetch("http://127.0.0.1:7604/ingest/492871f3-3967-48e7-a66a-f15499571c9d", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "22a606" },
        body: JSON.stringify({
          sessionId: "22a606",
          runId: "ui-repro",
          hypothesisId: "H4",
          location: "src/server.ts:122",
          message: "Incidents list unauthorized",
          data: { hasAuthorizationHeader: Boolean(req.header("authorization")) },
          timestamp: Date.now()
        })
      }).catch(() => {});
      // #endregion
      return res.status(401).json({ error: "Unauthorized" });
    }
    return res.json({ items: await service.listIncidents(req.auth.tenantId) });
  });

  app.get("/api/incidents/:incidentId", async (req, res) => {
    if (!req.auth) return res.status(401).json({ error: "Unauthorized" });
    try {
      return res.json(await service.getIncidentDetails(req.auth.tenantId, req.params.incidentId));
    } catch {
      return res.status(404).json({ error: "Incident not found" });
    }
  });

  app.post("/api/webhooks/servicenow/incidents", async (req, res) => {
    if (!hasValidSignature(req, config.servicenowWebhookSecret)) {
      return res.status(401).json({ error: "Invalid ServiceNow webhook signature" });
    }
    const tenantId = tenantHeaderSchema.safeParse(req.header("x-tenant-id"));
    if (!tenantId.success) return res.status(400).json({ error: "Missing or invalid x-tenant-id" });
    const bodySchema = z.object({
      externalId: z.string().min(3),
      title: z.string().min(3),
      service: z.string().min(2),
      severity: z.enum(["sev1", "sev2", "sev3"]),
      phase: z.enum(["investigating", "mitigating", "monitoring", "resolved"]).optional()
    });
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const incident = await service.ingestServiceNowIncident({ tenantId: tenantId.data, ...parsed.data });
    return res.status(202).json(incident);
  });

  app.post("/api/integrations/slack/events", async (req, res) => {
    if (!hasValidSignature(req, config.slackWebhookSecret)) {
      return res.status(401).json({ error: "Invalid Slack webhook signature" });
    }
    const tenantId = tenantHeaderSchema.safeParse(req.header("x-tenant-id"));
    if (!tenantId.success) return res.status(400).json({ error: "Missing or invalid x-tenant-id" });
    const bodySchema = z.object({
      incidentId: z.string().uuid(),
      user: z.string().min(2),
      text: z.string().min(1)
    });
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const event = await service.ingestSlackEvent({ tenantId: tenantId.data, ...parsed.data });
    return res.status(202).json(event);
  });

  app.post("/api/incidents/:incidentId/timeline", async (req, res) => {
    if (!req.auth) return res.status(401).json({ error: "Unauthorized" });
    const bodySchema = z.object({
      type: z.string().min(2),
      message: z.string().min(3)
    });
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const event = await service.createTimelineEvent({
      tenantId: req.auth.tenantId,
      incidentId: req.params.incidentId,
      source: "operator",
      ...parsed.data
    });
    return res.status(201).json(event);
  });

  app.post("/api/incidents/:incidentId/decisions", async (req, res) => {
    if (!req.auth) return res.status(401).json({ error: "Unauthorized" });
    const bodySchema = z.object({
      decision: z.string().min(5),
      rationale: z.string().min(5),
      approvedBy: z.string().min(2)
    });
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const decision = await service.addDecision({
      tenantId: req.auth.tenantId,
      incidentId: req.params.incidentId,
      ...parsed.data
    });
    return res.status(201).json(decision);
  });

  app.post("/api/incidents/:incidentId/updates", async (req, res) => {
    if (!req.auth) return res.status(401).json({ error: "Unauthorized" });
    const bodySchema = z.object({
      audience: z.enum(["exec", "customer", "internal"])
    });
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    try {
      const update = await service.generateUpdate({
        tenantId: req.auth.tenantId,
        incidentId: req.params.incidentId,
        ...parsed.data
      });
      return res.status(201).json(update);
    } catch {
      return res.status(404).json({ error: "Incident not found" });
    }
  });

  app.post("/api/incidents/:incidentId/resolve", async (req, res) => {
    if (!req.auth) return res.status(401).json({ error: "Unauthorized" });
    try {
      const incident = await service.resolveIncident({ tenantId: req.auth.tenantId, incidentId: req.params.incidentId });
      return res.status(202).json(incident);
    } catch {
      return res.status(404).json({ error: "Incident not found" });
    }
  });

  const processQueuedJobs = async () => service.processNextJob();

  return { app, service, processQueuedJobs, queue };
}
