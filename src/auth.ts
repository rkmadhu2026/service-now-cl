import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { config } from "./config.js";

const authHeaderSchema = z.string().regex(/^Bearer\s+.+$/);

export interface AuthClaims {
  sub: string;
  tenantId: string;
  role: "admin" | "commander" | "responder" | "observer";
}

export function signAccessToken(claims: AuthClaims) {
  return jwt.sign(claims, config.jwtSecret, { expiresIn: "8h" });
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const parsed = authHeaderSchema.safeParse(req.header("authorization"));
  if (!parsed.success) {
    // #region agent log
    fetch("http://127.0.0.1:7604/ingest/492871f3-3967-48e7-a66a-f15499571c9d", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "22a606" },
      body: JSON.stringify({
        sessionId: "22a606",
        runId: "ui-repro",
        hypothesisId: "H5",
        location: "src/auth.ts:22",
        message: "Auth header missing or malformed",
        data: { path: req.path, hasAuthorizationHeader: Boolean(req.header("authorization")) },
        timestamp: Date.now()
      })
    }).catch(() => {});
    // #endregion
    return res.status(401).json({ error: "Missing bearer token" });
  }
  const token = parsed.data.replace(/^Bearer\s+/, "");

  try {
    const payload = jwt.verify(token, config.jwtSecret) as AuthClaims;
    req.auth = payload;
    // #region agent log
    fetch("http://127.0.0.1:7604/ingest/492871f3-3967-48e7-a66a-f15499571c9d", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "22a606" },
      body: JSON.stringify({
        sessionId: "22a606",
        runId: "ui-repro",
        hypothesisId: "H5",
        location: "src/auth.ts:39",
        message: "Token accepted by auth middleware",
        data: { path: req.path, tenantId: payload.tenantId, role: payload.role },
        timestamp: Date.now()
      })
    }).catch(() => {});
    // #endregion
    return next();
  } catch {
    // #region agent log
    fetch("http://127.0.0.1:7604/ingest/492871f3-3967-48e7-a66a-f15499571c9d", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "22a606" },
      body: JSON.stringify({
        sessionId: "22a606",
        runId: "ui-repro",
        hypothesisId: "H5",
        location: "src/auth.ts:54",
        message: "Token rejected by auth middleware",
        data: { path: req.path, hasAuthorizationHeader: Boolean(req.header("authorization")) },
        timestamp: Date.now()
      })
    }).catch(() => {});
    // #endregion
    return res.status(401).json({ error: "Invalid token" });
  }
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthClaims;
      rawBody?: Buffer;
    }
  }
}
