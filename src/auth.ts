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
    return res.status(401).json({ error: "Missing bearer token" });
  }
  const token = parsed.data.replace(/^Bearer\s+/, "");

  try {
    const payload = jwt.verify(token, config.jwtSecret) as AuthClaims;
    req.auth = payload;
    return next();
  } catch {
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
