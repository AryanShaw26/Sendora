import express from "express";
import { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const state = {
    jobs: new Map<string, any>(),
    emailIds: new Set<string>(),
  };
  const emailFindMany = vi.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
    where.id.in.filter((id) => state.emailIds.has(id)).map((id) => ({ id })),
  );
  const queue = {
    name: "email-queue",
    opts: { prefix: "bull" },
    waitUntilReady: vi.fn(async () => undefined),
    getJobCounts: vi.fn(async () => ({
      active: 0,
      waiting: 0,
      delayed: 0,
      completed: state.jobs.size,
      failed: 0,
      paused: 0,
      "waiting-children": 0,
      prioritized: 0,
    })),
    getJobs: vi.fn(async (_types: string[], start: number, end: number) =>
      [...state.jobs.values()]
        .filter((job) => job.state === "completed")
        .slice(start, end + 1),
    ),
    getJob: vi.fn(async (id: string) => state.jobs.get(id)),
    remove: vi.fn(),
  };
  const prisma = {
    $queryRaw: vi.fn(async () => [{ result: 1 }]),
    email: {
      findMany: emailFindMany,
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
  };
  return {
    state,
    env: {
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://user:secret@neon.example.test/db?sslmode=require",
      REDIS_HOST: "red-production-redis",
      REDIS_PORT: 6379,
      ADMIN_EMAILS: "admin@sendora.test",
    },
    emailFindMany,
    queue,
    prisma,
  };
});

vi.mock("../src/config/env", () => ({ env: mocks.env }));
vi.mock("../src/queue/queue", () => ({ emailQueue: mocks.queue }));
vi.mock("../src/db/prisma", () => ({ prisma: mocks.prisma }));
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

function addJob(id: string, state = "completed", emailId = id) {
  const job = {
    id,
    data: { emailId },
    state,
    getState: vi.fn(async () => job.state),
    remove: vi.fn(),
  };
  mocks.state.jobs.set(id, job);
  return job;
}

describe("GET /api/admin/queue-cleanup/preview", () => {
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
    mocks.env.NODE_ENV = "production";
    mocks.env.DATABASE_URL = "postgresql://user:secret@neon.example.test/db?sslmode=require";
    mocks.env.REDIS_HOST = "red-production-redis";
    mocks.env.REDIS_PORT = 6379;
    mocks.env.ADMIN_EMAILS = "admin@sendora.test";
    mocks.state.jobs.clear();
    mocks.state.emailIds.clear();
    mocks.queue.waitUntilReady.mockReset().mockResolvedValue(undefined);
    mocks.queue.getJobCounts.mockReset().mockImplementation(async () => ({
      active: 0,
      waiting: 0,
      delayed: 0,
      completed: mocks.state.jobs.size,
      failed: 0,
      paused: 0,
      "waiting-children": 0,
      prioritized: 0,
    }));
    mocks.queue.getJobs.mockReset().mockImplementation(async (_types: string[], start: number, end: number) =>
      [...mocks.state.jobs.values()]
        .filter((job) => job.state === "completed")
        .slice(start, end + 1),
    );
    mocks.queue.getJob.mockReset().mockImplementation(async (id: string) => mocks.state.jobs.get(id));
    mocks.prisma.$queryRaw.mockReset().mockResolvedValue([{ result: 1 }]);
    mocks.emailFindMany.mockReset().mockImplementation(async ({ where }) =>
      where.id.in.filter((id) => mocks.state.emailIds.has(id)).map((id) => ({ id })),
    );
    for (const operation of [
      mocks.prisma.email.create,
      mocks.prisma.email.update,
      mocks.prisma.email.delete,
      mocks.prisma.email.deleteMany,
      mocks.queue.remove,
    ]) operation.mockClear();
  });

  it("returns 401 without authentication", async () => {
    const response = await fetch(`${baseUrl}/api/admin/queue-cleanup/preview`);
    expect(response.status).toBe(401);
    expect(mocks.queue.getJobCounts).not.toHaveBeenCalled();
  });

  it("returns 403 for an authenticated non-admin", async () => {
    const response = await fetch(`${baseUrl}/api/admin/queue-cleanup/preview`, {
      headers: { "x-test-user-email": "user@sendora.test" },
    });
    expect(response.status).toBe(403);
    expect(mocks.queue.getJobCounts).not.toHaveBeenCalled();
  });

  it("fails closed when ADMIN_EMAILS is empty", async () => {
    mocks.env.ADMIN_EMAILS = " ,  ";
    const response = await fetch(`${baseUrl}/api/admin/queue-cleanup/preview`, {
      headers: { "x-test-user-email": "admin@sendora.test" },
    });
    expect(response.status).toBe(403);
    expect(mocks.queue.getJobCounts).not.toHaveBeenCalled();
  });

  it("reports matching and orphan completed jobs for an admin without exposing secrets or writing", async () => {
    addJob("matched-job", "completed", "matching-email");
    addJob("orphan-job");
    mocks.state.emailIds.add("matching-email");

    const response = await fetch(`${baseUrl}/api/admin/queue-cleanup/preview`, {
      headers: { "x-test-user-email": "ADMIN@sendora.test" },
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      queue: {
        name: "email-queue",
        prefix: "bull",
        countsBeforeInspection: { completed: 2 },
      },
      completedJobsInspected: 2,
      candidateCount: 1,
      jobs: [
        { jobId: "matched-job", state: "completed", emailId: "matching-email", databaseRecordExists: true, candidate: false },
        { jobId: "orphan-job", state: "completed", emailId: "orphan-job", databaseRecordExists: false, candidate: true },
      ],
    });
    expect(body.inspectedAt).toEqual(expect.any(String));
    expect(JSON.stringify(body)).not.toMatch(/secret|password|postgresql:\/\//i);
    expect(mocks.prisma.$queryRaw).toHaveBeenCalledOnce();
    expect(mocks.emailFindMany).toHaveBeenCalledWith({
      where: { id: { in: ["matched-job", "matching-email"] } },
      select: { id: true },
    });
    expect(mocks.prisma.email.create).not.toHaveBeenCalled();
    expect(mocks.prisma.email.update).not.toHaveBeenCalled();
    expect(mocks.prisma.email.delete).not.toHaveBeenCalled();
    expect(mocks.prisma.email.deleteMany).not.toHaveBeenCalled();
    expect(mocks.queue.remove).not.toHaveBeenCalled();
    expect([...mocks.state.jobs.values()].every((job) => !job.remove.mock.calls.length)).toBe(true);
  });

  it("also matches Email records by the BullMQ job ID", async () => {
    addJob("email-record-id");
    mocks.state.emailIds.add("email-record-id");

    const response = await fetch(`${baseUrl}/api/admin/queue-cleanup/preview`, {
      headers: { "x-test-user-email": "admin@sendora.test" },
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.jobs[0]).toMatchObject({
      jobId: "email-record-id",
      databaseRecordExists: true,
      matchedEmailIds: ["email-record-id"],
      candidate: false,
    });
  });

  it("excludes a job whose state changes during verification", async () => {
    const job = addJob("moving-job");
    job.getState
      .mockResolvedValueOnce("completed")
      .mockResolvedValueOnce("waiting");

    const response = await fetch(`${baseUrl}/api/admin/queue-cleanup/preview`, {
      headers: { "x-test-user-email": "admin@sendora.test" },
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.jobs[0]).toMatchObject({
      state: "waiting",
      stateAtStart: "completed",
      stateChangedDuringInspection: true,
      candidate: false,
    });
    expect(body.candidateCount).toBe(0);
  });

  it("paginates completed jobs and refuses an inconsistent queue snapshot", async () => {
    for (let index = 0; index < 101; index += 1) addJob(`job-${index}`);
    const response = await fetch(`${baseUrl}/api/admin/queue-cleanup/preview`, {
      headers: { "x-test-user-email": "admin@sendora.test" },
    });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.completedJobsInspected).toBe(101);
    expect(mocks.queue.getJobs).toHaveBeenNthCalledWith(1, ["completed"], 0, 99);
    expect(mocks.queue.getJobs).toHaveBeenNthCalledWith(2, ["completed"], 100, 100);
  });

  it("returns 409 rather than an incomplete report when pagination is unstable", async () => {
    addJob("one-job");
    mocks.queue.getJobCounts.mockResolvedValueOnce({
      active: 0,
      waiting: 0,
      delayed: 0,
      completed: 2,
      failed: 0,
      paused: 0,
      "waiting-children": 0,
      prioritized: 0,
    });

    const response = await fetch(`${baseUrl}/api/admin/queue-cleanup/preview`, {
      headers: { "x-test-user-email": "admin@sendora.test" },
    });
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("QUEUE_CHANGED_DURING_INSPECTION");
  });

  it("fails closed when production endpoint configuration is missing", async () => {
    mocks.env.REDIS_HOST = "localhost";
    const response = await fetch(`${baseUrl}/api/admin/queue-cleanup/preview`, {
      headers: { "x-test-user-email": "admin@sendora.test" },
    });
    expect(response.status).toBe(503);
    expect(mocks.queue.waitUntilReady).not.toHaveBeenCalled();
  });

  it("fails closed when the PostgreSQL URL is missing", async () => {
    mocks.env.DATABASE_URL = "";
    const response = await fetch(`${baseUrl}/api/admin/queue-cleanup/preview`, {
      headers: { "x-test-user-email": "admin@sendora.test" },
    });
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("DATABASE_CONFIG_REQUIRED");
    expect(mocks.queue.waitUntilReady).not.toHaveBeenCalled();
  });

  it.each(["redis", "postgres"] as const)("fails closed on %s connection failure", async (connection) => {
    if (connection === "redis") mocks.queue.waitUntilReady.mockRejectedValueOnce(new Error("connection details hidden"));
    else mocks.prisma.$queryRaw.mockRejectedValueOnce(new Error("connection details hidden"));

    const response = await fetch(`${baseUrl}/api/admin/queue-cleanup/preview`, {
      headers: { "x-test-user-email": "admin@sendora.test" },
    });
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toMatch(/connection details|secret|postgresql:\/\//i);
  });
});
