import cors from "cors";
import express from "express";
import type { Request } from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { requireAuth, signAccessToken } from "./auth.js";
import { config } from "./config.js";
import { hashPassword, verifyPassword } from "./password.js";
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
  const prisma = config.usePrisma ? getPrismaClient() : undefined;
  const store = config.usePrisma ? new PrismaStore(prisma!) : new InMemoryStore();
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

  // Frontend routes
  app.get("/", (_req, res) => res.sendFile(path.join(__dirname, "..", "public", "landing.html")));
  app.get("/auth", (_req, res) => res.sendFile(path.join(__dirname, "..", "public", "auth.html")));
  app.get("/app", (_req, res) => res.sendFile(path.join(__dirname, "..", "public", "app.html")));
  app.use(express.static(path.join(__dirname, "..", "public")));

  app.get("/health", (_req, res) => res.json({ status: "ok" }));

  app.post("/api/auth/token", (req, res) => {
    const bodySchema = z.object({
      subject: z.string().min(2),
      tenantId: z.string().uuid(),
      role: z.enum(["admin", "commander", "responder", "observer"])
    });
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const token = signAccessToken({
      sub: parsed.data.subject,
      tenantId: parsed.data.tenantId,
      role: parsed.data.role
    });
    return res.json({ token });
  });

  app.post("/api/auth/signup", async (req, res) => {
    if (!prisma) return res.status(501).json({ error: "Signup requires USE_PRISMA=true" });
    const bodySchema = z.object({
      organizationName: z.string().min(2),
      fullName: z.string().min(2),
      email: z.string().email(),
      password: z.string().min(8).max(128)
    });
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const email = parsed.data.email.toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(409).json({ error: "User already exists" });

    const passwordHash = await hashPassword(parsed.data.password);
    const created = await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({ data: { name: parsed.data.organizationName } });
      const user = await tx.user.create({
        data: {
          tenantId: tenant.id,
          email,
          name: parsed.data.fullName,
          passwordHash,
          role: "admin"
        }
      });
      return { tenant, user };
    });

    const token = signAccessToken({
      sub: created.user.email,
      tenantId: created.tenant.id,
      role: "admin"
    });
    return res.status(201).json({
      token,
      user: { id: created.user.id, email: created.user.email, fullName: created.user.name, role: created.user.role },
      tenant: { id: created.tenant.id, name: created.tenant.name }
    });
  });

  app.post("/api/auth/login", async (req, res) => {
    if (!prisma) return res.status(501).json({ error: "Login requires USE_PRISMA=true" });
    const bodySchema = z.object({
      email: z.string().email(),
      password: z.string().min(8).max(128)
    });
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const email = parsed.data.email.toLowerCase();

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // No lastLoginAt column yet in this database. We keep auth response lightweight.

    const role = user.role as "admin" | "commander" | "responder" | "observer";
    const token = signAccessToken({ sub: user.email, tenantId: user.tenantId, role });
    return res.json({
      token,
      user: { id: user.id, email: user.email, fullName: user.name, role: user.role },
      tenant: { id: user.tenantId }
    });
  });

  app.post("/api/tenants", async (req, res) => {
    const bodySchema = z.object({ name: z.string().min(2) });
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    return res.status(201).json(await service.createTenant(parsed.data.name));
  });

  app.use("/api/incidents", requireAuth);

  app.get("/api/incidents", async (req, res) => {
    if (!req.auth) return res.status(401).json({ error: "Unauthorized" });
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
