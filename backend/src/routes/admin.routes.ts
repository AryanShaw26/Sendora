import { Router, Request, Response, NextFunction } from "express";
import { env } from "../config/env";
import { authMiddleware } from "../middleware/auth";
import { emailQueue } from "../queue/queue";

const router = Router();

function adminEmailAllowlist(): Set<string> {
  return new Set(
    env.ADMIN_EMAILS.split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const email = req.user?.email.trim().toLowerCase();
  if (!email || !adminEmailAllowlist().has(email)) {
    res.status(403).json({
      error: { code: "FORBIDDEN", message: "Administrator access required" },
    });
    return;
  }
  next();
}

function readInfoField(info: string, field: string): string | null {
  return info.match(new RegExp(`^${field}:(.+)$`, "m"))?.[1] ?? null;
}

router.get(
  "/queue-diagnostics",
  authMiddleware,
  requireAdmin,
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const client = await emailQueue.client;
      const [serverInfo, counts] = await Promise.all([
        client.info(),
        emailQueue.getJobCounts(
          "active",
          "waiting",
          "delayed",
          "completed",
          "failed",
          "paused",
          "waiting-children",
          "prioritized",
        ),
      ]);

      res.json({
        redis: {
          host: env.REDIS_HOST,
          port: env.REDIS_PORT,
          database: client.options.db ?? 0,
          tlsEnabled: env.REDIS_TLS,
          runId: readInfoField(serverInfo, "run_id"),
          version: readInfoField(serverInfo, "redis_version"),
        },
        queue: {
          name: emailQueue.name,
          prefix: emailQueue.opts.prefix ?? "bull",
          counts,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

export const adminRouter = router;
