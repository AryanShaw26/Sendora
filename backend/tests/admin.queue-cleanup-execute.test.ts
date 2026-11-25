import express from "express";
import { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const APPROVED_ID = "fc72dcc6-2ed6-4f08-ad70-0363491e543d";
const UNKNOWN_ID = "11111111-1111-4111-8111-111111111111";
const ALL_APPROVED_IDS = [
  "fc72dcc6-2ed6-4f08-ad70-0363491e543d",
  "8a69ee94-70f9-4fba-96f2-53ffd717adef",
  "41ae12ec-bdf7-4e5c-aaf3-55be7f8d0d28",
  "f6fee3b7-77f2-47d8-add1-db2a7eb1feee",
  "fee7b958-246e-439a-afc4-97c504eff0ab",
  "6283d76f-9f41-4c15-bb2a-357ae897a193",
  "3d63394f-528a-46f3-b5e3-7c9dfd2038cd",
  "34306197-b84d-4476-8127-ff909f48e29d",
  "2857141e-1a8e-4294-b504-2718a2fe9b66",
  "f719a2a6-08a9-47e0-ab0a-a19229f4d64c",
  "b5af3206-29f8-45e9-ba4b-02155bcff421",
  "860edcf9-ede1-4adc-9642-8cea0bcfdf2c",
  "6c9c3b3c-8aad-4dcf-b6af-496d19dbb401",
  "2d3bb819-1630-4756-ae13-1ee32ace203c",
  "ed67acb5-e416-4592-8b0c-24e4ef14810b",
  "84b28711-6e81-4660-aec4-e2deeeb1e084",
  "fd0c1103-77ba-4467-88fa-087516a10785",
  "aea4f343-a746-4518-b668-76925d91c646",
  "ced2b33c-e1b5-4416-80bf-5f9266c1a4a2",
];

const mocks = vi.hoisted(() => {
  const state = {
    jobs: new Map<string, any>(),
    emailIds: new Set<string>(),
    lockToken: null as string | null,
  };
  const emailFindMany = vi.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
    where.id.in.filter((id) => state.emailIds.has(id)).map((id) => ({ id })),
  );
  const redis = {
    set: vi.fn(async (_key: string, token: string) => {
      if (state.lockToken) return null;
      state.lockToken = token;
      return "OK";
    }),
    eval: vi.fn(async (script: string, _numberOfKeys: number, _key: string, token: string) => {
      if (script.includes("pexpire")) return state.lockToken === token ? 1 : 0;
      if (script.includes("del")) {
        if (state.lockToken !== token) return 0;
        state.lockToken = null;
        return 1;
      }
      return 0;
    }),
  };
  const queue = {
    name: "email-queue",
    opts: { prefix: "bull" },
    client: Promise.resolve(redis),
    waitUntilReady: vi.fn(async () => undefined),
    getJobCounts: vi.fn(async () => ({
      active: 0,
      waiting: 0,
      delayed: 0,
      completed: [...state.jobs.values()].filter((job) => job.state === "completed").length,
      failed: 0,
      paused: 0,
      "waiting-children": 0,
      prioritized: 0,
    })),
    getJobs: vi.fn(async () => []),
    getJob: vi.fn(async (id: string) => state.jobs.get(id)),
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
    redis,
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

function addJob(
  id: string,
  options: { state?: string; jobId?: string; emailId?: string; removeError?: Error } = {},
) {
  const job = {
    id: options.jobId ?? id,
    data: { emailId: options.emailId ?? id },
    state: options.state ?? "completed",
    getState: vi.fn(async () => job.state),
    remove: vi.fn(async () => {
      if (options.removeError) throw options.removeError;
      mocks.state.jobs.delete(id);
    }),
  };
  mocks.state.jobs.set(id, job);
  return job;
}

describe("POST /api/admin/queue-cleanup/execute", () => {
  const app = express();
  let server: ReturnType<typeof app.listen>;
  let baseUrl: string;

  beforeAll(async () => {
    app.use(express.json());
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
    mocks.state.lockToken = null;
    mocks.queue.waitUntilReady.mockReset().mockResolvedValue(undefined);
    mocks.queue.getJobCounts.mockReset().mockImplementation(async () => ({
      active: 0,
      waiting: 0,
      delayed: 0,
      completed: [...mocks.state.jobs.values()].filter((job) => job.state === "completed").length,
      failed: 0,
      paused: 0,
      "waiting-children": 0,
      prioritized: 0,
    }));
    mocks.queue.getJob.mockReset().mockImplementation(async (id: string) => mocks.state.jobs.get(id));
    mocks.redis.set.mockReset().mockImplementation(async (_key: string, token: string) => {
      if (mocks.state.lockToken) return null;
      mocks.state.lockToken = token;
      return "OK";
    });
    mocks.redis.eval.mockReset().mockImplementation(async (script: string, _numberOfKeys: number, _key: string, token: string) => {
      if (script.includes("pexpire")) return mocks.state.lockToken === token ? 1 : 0;
      if (script.includes("del")) {
        if (mocks.state.lockToken !== token) return 0;
        mocks.state.lockToken = null;
        return 1;
      }
      return 0;
    });
    mocks.prisma.$queryRaw.mockReset().mockResolvedValue([{ result: 1 }]);
    mocks.emailFindMany.mockReset().mockImplementation(async ({ where }) =>
      where.id.in.filter((id) => mocks.state.emailIds.has(id)).map((id) => ({ id })),
    );
    for (const operation of [
      mocks.prisma.email.create,
      mocks.prisma.email.update,
      mocks.prisma.email.delete,
      mocks.prisma.email.deleteMany,
    ]) operation.mockClear();
  });

  async function post(body: unknown, authenticated = true) {
    return fetch(`${baseUrl}/api/admin/queue-cleanup/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(authenticated ? { "x-test-user-email": "admin@sendora.test" } : {}),
      },
      body: JSON.stringify(body),
    });
  }

  it("requires authentication and administrator authorization", async () => {
    const anonymous = await post({ confirm: "DELETE_19_APPROVED_ORPHANED_JOBS", jobIds: [APPROVED_ID] }, false);
    expect(anonymous.status).toBe(401);

    const nonAdmin = await fetch(`${baseUrl}/api/admin/queue-cleanup/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-test-user-email": "user@sendora.test" },
      body: JSON.stringify({ confirm: "DELETE_19_APPROVED_ORPHANED_JOBS", jobIds: [APPROVED_ID] }),
    });
    expect(nonAdmin.status).toBe(403);
    expect(mocks.redis.set).not.toHaveBeenCalled();
  });

  it("fails closed when ADMIN_EMAILS is empty", async () => {
    mocks.env.ADMIN_EMAILS = "";
    const response = await post({ confirm: "DELETE_19_APPROVED_ORPHANED_JOBS", jobIds: [APPROVED_ID] });
    expect(response.status).toBe(403);
    expect(mocks.redis.set).not.toHaveBeenCalled();
  });

  it.each([undefined, "wrong phrase"])("rejects missing or invalid confirmation (%s)", async (confirm) => {
    const response = await post({ confirm, jobIds: [APPROVED_ID] });
    expect(response.status).toBe(400);
    expect(mocks.redis.set).not.toHaveBeenCalled();
  });

  it("rejects an empty list, unknown ID, and duplicate IDs", async () => {
    const empty = await post({ confirm: "DELETE_19_APPROVED_ORPHANED_JOBS", jobIds: [] });
    const unknown = await post({ confirm: "DELETE_19_APPROVED_ORPHANED_JOBS", jobIds: [UNKNOWN_ID] });
    const duplicate = await post({ confirm: "DELETE_19_APPROVED_ORPHANED_JOBS", jobIds: [APPROVED_ID, APPROVED_ID] });
    expect([empty.status, unknown.status, duplicate.status]).toEqual([400, 400, 400]);
    expect(mocks.redis.set).not.toHaveBeenCalled();
  });

  it("accepts only the complete fixed set of 19 approved IDs", async () => {
    const response = await post({ confirm: "DELETE_19_APPROVED_ORPHANED_JOBS", jobIds: ALL_APPROVED_IDS });
    const report = await response.json();
    expect(response.status).toBe(200);
    expect(report.requestedJobCount).toBe(19);
    expect(report.skippedCount).toBe(19);
    expect(report.successfullyRemovedCount).toBe(0);
  });

  it("skips a missing job", async () => {
    const response = await post({ confirm: "DELETE_19_APPROVED_ORPHANED_JOBS", jobIds: [APPROVED_ID] });
    const report = await response.json();
    expect(response.status).toBe(200);
    expect(report.results[0]).toMatchObject({ result: "skipped", reason: "job does not exist" });
    expect(report.successfullyRemovedCount).toBe(0);
  });

  it("skips non-completed jobs, ID mismatches, and data emailId mismatches", async () => {
    addJob(APPROVED_ID, { state: "failed" });
    const failed = await post({ confirm: "DELETE_19_APPROVED_ORPHANED_JOBS", jobIds: [APPROVED_ID] });
    expect((await failed.json()).results[0].reason).toBe("job state is not completed");

    mocks.state.jobs.clear();
    addJob(APPROVED_ID, { jobId: UNKNOWN_ID });
    const wrongJobId = await post({ confirm: "DELETE_19_APPROVED_ORPHANED_JOBS", jobIds: [APPROVED_ID] });
    expect((await wrongJobId.json()).results[0].reason).toBe("job.id does not match submitted ID");

    mocks.state.jobs.clear();
    addJob(APPROVED_ID, { emailId: UNKNOWN_ID });
    const wrongEmailId = await post({ confirm: "DELETE_19_APPROVED_ORPHANED_JOBS", jobIds: [APPROVED_ID] });
    expect((await wrongEmailId.json()).results[0].reason).toBe("job.data.emailId does not match submitted ID");
    expect([...mocks.state.jobs.keys()]).toEqual([APPROVED_ID]);
  });

  it("skips jobs with a matching Email record and checks both identifiers", async () => {
    addJob(APPROVED_ID);
    mocks.state.emailIds.add(APPROVED_ID);
    const response = await post({ confirm: "DELETE_19_APPROVED_ORPHANED_JOBS", jobIds: [APPROVED_ID] });
    const report = await response.json();
    expect(report.results[0]).toMatchObject({ result: "skipped", reason: "matching Email record exists" });
    expect(mocks.emailFindMany).toHaveBeenCalledWith({
      where: { id: { in: [APPROVED_ID] } },
      select: { id: true },
    });
    expect(mocks.state.jobs.has(APPROVED_ID)).toBe(true);
  });

  it("removes one verified job individually and reports counts", async () => {
    const job = addJob(APPROVED_ID);
    addJob(UNKNOWN_ID);
    const response = await post({ confirm: "DELETE_19_APPROVED_ORPHANED_JOBS", jobIds: [APPROVED_ID] });
    const report = await response.json();

    expect(response.status).toBe(200);
    expect(job.remove).toHaveBeenCalledOnce();
    expect(report).toMatchObject({
      requestedJobCount: 1,
      successfullyRemovedCount: 1,
      skippedCount: 0,
      failedRemovalCount: 0,
      queueCountsBefore: { completed: 2 },
      queueCountsAfter: { completed: 1 },
    });
    expect(report.results[0]).toMatchObject({ result: "removed", jobId: APPROVED_ID });
    expect(mocks.state.jobs.has(UNKNOWN_ID)).toBe(true);
    expect(mocks.prisma.email.create).not.toHaveBeenCalled();
    expect(mocks.prisma.email.update).not.toHaveBeenCalled();
    expect(mocks.prisma.email.delete).not.toHaveBeenCalled();
    expect(mocks.prisma.email.deleteMany).not.toHaveBeenCalled();
  });

  it("reports failed removal without retrying it", async () => {
    const job = addJob(APPROVED_ID, { removeError: new Error("private connection detail") });
    const response = await post({ confirm: "DELETE_19_APPROVED_ORPHANED_JOBS", jobIds: [APPROVED_ID] });
    const report = await response.json();
    expect(report.failedRemovalCount).toBe(1);
    expect(report.successfullyRemovedCount).toBe(0);
    expect(job.remove).toHaveBeenCalledOnce();
    expect(JSON.stringify(report)).not.toContain("private connection detail");
  });

  it.each(["redis", "postgres"] as const)("fails closed on %s failure", async (service) => {
    if (service === "redis") mocks.queue.waitUntilReady.mockRejectedValueOnce(new Error("private"));
    else mocks.prisma.$queryRaw.mockRejectedValueOnce(new Error("private"));
    addJob(APPROVED_ID);
    const response = await post({ confirm: "DELETE_19_APPROVED_ORPHANED_JOBS", jobIds: [APPROVED_ID] });
    expect(response.status).toBe(503);
    expect(mocks.redis.set).not.toHaveBeenCalled();
    expect([...mocks.state.jobs.values()][0].remove).not.toHaveBeenCalled();
  });

  it("rejects a concurrent cleanup request using the Redis lock", async () => {
    addJob(APPROVED_ID);
    let unblock!: () => void;
    const waiting = new Promise<void>((resolve) => { unblock = resolve; });
    let countCalls = 0;
    mocks.queue.getJobCounts.mockImplementation(async () => {
      countCalls += 1;
      if (countCalls === 1) await waiting;
      return { active: 0, waiting: 0, delayed: 0, completed: mocks.state.jobs.size, failed: 0, paused: 0 };
    });

    const firstRequest = post({ confirm: "DELETE_19_APPROVED_ORPHANED_JOBS", jobIds: [APPROVED_ID] });
    await vi.waitFor(() => expect(mocks.redis.set).toHaveBeenCalledOnce());
    const secondResponse = await post({ confirm: "DELETE_19_APPROVED_ORPHANED_JOBS", jobIds: [APPROVED_ID] });
    expect(secondResponse.status).toBe(409);
    unblock();
    const firstResponse = await firstRequest;
    expect(firstResponse.status).toBe(200);
    expect(mocks.redis.eval).toHaveBeenCalled();
  });
});
