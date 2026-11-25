import express from "express";
import { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  env: {
    ADMIN_EMAILS: "admin@sendora.test",
    REDIS_HOST: "redis.internal",
    REDIS_PORT: 6380,
    REDIS_TLS: true,
  },
  info: vi.fn(async () => "# Server\nredis_version:7.2.4\nrun_id:abc123\n"),
  getJobCounts: vi.fn(async () => ({
    active: 1,
    waiting: 2,
    delayed: 3,
    completed: 4,
    failed: 5,
    paused: 6,
    "waiting-children": 7,
    prioritized: 8,
  })),
}));

vi.mock("../src/config/env", () => ({ env: mocks.env }));
vi.mock("../src/queue/queue", () => ({
  emailQueue: {
    name: "email-queue",
    opts: { prefix: "bull-sendora" },
    client: Promise.resolve({ options: { db: 4 }, info: mocks.info }),
    getJobCounts: mocks.getJobCounts,
  },
}));
vi.mock("../src/middleware/auth", () => ({
  authMiddleware: (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const email = req.header("x-test-user-email");
    if (!email) {
      res.status(401).json({ error: { code: "UNAUTHORIZED" } });
      return;
    }
    req.user = { id: "test-user", email, name: "Test User" };
    next();
  },
}));

import { adminRouter } from "../src/routes/admin.routes";

describe("GET /api/admin/queue-diagnostics", () => {
  const app = express();
  let server: ReturnType<typeof app.listen>;
  let baseUrl: string;

  beforeAll(async () => {
    app.use("/api/admin", adminRouter);
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });

  beforeEach(() => {
    mocks.info.mockClear();
    mocks.getJobCounts.mockClear();
  });

  it("requires authentication", async () => {
    const response = await fetch(`${baseUrl}/api/admin/queue-diagnostics`);
    expect(response.status).toBe(401);
    expect(mocks.info).not.toHaveBeenCalled();
    expect(mocks.getJobCounts).not.toHaveBeenCalled();
  });

  it("rejects authenticated non-admin users", async () => {
    const response = await fetch(`${baseUrl}/api/admin/queue-diagnostics`, {
      headers: { "x-test-user-email": "user@sendora.test" },
    });
    expect(response.status).toBe(403);
    expect(mocks.info).not.toHaveBeenCalled();
    expect(mocks.getJobCounts).not.toHaveBeenCalled();
  });

  it("returns safe Redis identity and queue diagnostics for an admin", async () => {
    const response = await fetch(`${baseUrl}/api/admin/queue-diagnostics`, {
      headers: { "x-test-user-email": "ADMIN@sendora.test" },
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      redis: {
        host: "redis.internal",
        port: 6380,
        database: 4,
        tlsEnabled: true,
        runId: "abc123",
        version: "7.2.4",
      },
      queue: {
        name: "email-queue",
        prefix: "bull-sendora",
        counts: {
          active: 1,
          waiting: 2,
          delayed: 3,
          completed: 4,
          failed: 5,
          paused: 6,
          "waiting-children": 7,
          prioritized: 8,
        },
      },
    });
    expect(mocks.info).toHaveBeenCalledWith();
    expect(mocks.getJobCounts).toHaveBeenCalledWith(
      "active",
      "waiting",
      "delayed",
      "completed",
      "failed",
      "paused",
      "waiting-children",
      "prioritized",
    );
    expect(JSON.stringify(body)).not.toMatch(/password|credential|secret|redis:\/\//i);
  });
});
