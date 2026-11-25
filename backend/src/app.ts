import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { ZodError } from "zod";
import { env } from "./config/env";
import { logger } from "./config/logger";
import { prisma } from "./db/prisma";
import { defaultRedis } from "./redis/connection";
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";
import { pingElasticsearch } from "./services/search.service";
import { scheduleRouter } from "./routes/schedule.routes";
import { authRouter } from "./routes/auth.routes";
import { userRouter } from "./routes/user.routes";
import { emailRouter } from "./routes/email.routes";
import { campaignRouter } from "./routes/campaign.routes";
import { senderRouter } from "./routes/sender.routes";
import { slackRouter } from "./routes/slack.routes";
import { authMiddleware } from "./middleware/auth";
import { emailQueue } from "./queue/queue";
import { adminRouter } from "./routes/admin.routes";

export function createApp(): express.Application {
  const app = express();

  app.use(
    helmet({
      contentSecurityPolicy: false, // Allows bull board assets
    }),
  );

  app.use(
    cors({
      origin: env.FRONTEND_URL,
      credentials: true,
    }),
  );

  app.use(express.json({ limit: "5mb" }));
  app.use(cookieParser());

  // Health check endpoint
  app.get("/health", async (_req: Request, res: Response) => {
    let dbOk = false;
    let redisOk = false;
    let esOk = false;

    try {
      await prisma.$queryRaw`SELECT 1`;
      dbOk = true;
    } catch (err) {
      logger.warn({ err }, "Health check: DB failed");
    }

    try {
      const pong = await defaultRedis.ping();
      redisOk = pong === "PONG";
    } catch (err) {
      logger.warn({ err }, "Health check: Redis failed");
    }

    if (env.ELASTICSEARCH_ENABLED) {
      try {
        esOk = await pingElasticsearch();
      } catch (err) {
        logger.warn({ err }, "Health check: ES failed");
      }
    }

    const allOk = dbOk && redisOk && (!env.ELASTICSEARCH_ENABLED || esOk);
    res.status(allOk ? 200 : 503).json({
      status: allOk ? "ok" : "degraded",
      db: dbOk ? "up" : "down",
      redis: redisOk ? "up" : "down",
      elasticsearch: env.ELASTICSEARCH_ENABLED
        ? esOk
          ? "up"
          : "down"
        : "disabled",
    });
  });

  // API & Auth Routes
  app.use("/auth", authRouter);
  app.use("/api", userRouter);
  app.use("/api/schedule", scheduleRouter);
  app.use("/api/emails", emailRouter);
  app.use("/api/campaigns", campaignRouter);
  app.use("/api/senders", senderRouter);
  app.use("/api/slack", slackRouter);
  app.use("/api/admin", adminRouter);

  // Bull Board Live Queue Dashboard
  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath(env.BULL_BOARD_PATH);
  createBullBoard({
    queues: [new BullMQAdapter(emailQueue)],
    serverAdapter,
  });
  app.use(env.BULL_BOARD_PATH, authMiddleware, serverAdapter.getRouter());

  // Central error handler
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ZodError) {
      res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: err.errors
            .map((e) => `${e.path.join(".")}: ${e.message}`)
            .join(", "),
        },
      });
      return;
    }

    if (
      err &&
      typeof err === "object" &&
      "status" in err &&
      typeof (err as { status: number }).status === "number"
    ) {
      const status = (err as { status: number }).status;
      const message = (err as { message?: string }).message || "Error";
      const code = (err as { code?: string }).code || "ERROR";
      res.status(status).json({ error: { code, message } });
      return;
    }

    const message =
      err instanceof Error ? err.message : "Internal Server Error";
    logger.error({ err }, "Unhandled application error");
    res.status(500).json({
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message:
          env.NODE_ENV === "production" ? "Internal server error" : message,
      },
    });
  });

  return app;
}
