import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  env: { NODE_ENV: "test", REDIS_HOST: "test-redis", REDIS_PORT: 6379 },
  emailQueue: { close: vi.fn(), waitUntilReady: vi.fn() },
  prisma: { email: {} },
  defaultRedis: { quit: vi.fn() },
}));

vi.mock("../src/config/env", () => ({ env: mocks.env }));
vi.mock("../src/queue/queue", () => ({ emailQueue: mocks.emailQueue }));
vi.mock("../src/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("../src/redis/connection", () => ({ defaultRedis: mocks.defaultRedis }));

import {
  assertProductionConnection,
  CleanupEmailStore,
  CleanupQueue,
  runOrphanJobCleanup,
} from "../scripts/cleanup-orphaned-completed-jobs";

type FakeJob = {
  id: string;
  data: { emailId?: string };
  state: string;
  getState: () => Promise<string>;
  remove: ReturnType<typeof vi.fn>;
};

function makeFixture(initialEmails: string[] = []) {
  const records = new Set(initialEmails);
  const jobs = new Map<string, FakeJob>();
  const removed: string[] = [];
  const counts = vi.fn(async () => ({ active: 0, waiting: 0, delayed: 0, completed: jobs.size, failed: 0 }));
  const addJob = (id: string, state = "completed", emailId = id) => {
    const job: FakeJob = {
      id,
      data: { emailId },
      state,
      getState: async () => job.state,
      remove: vi.fn(async () => {
        removed.push(id);
        jobs.delete(id);
      }),
    };
    jobs.set(id, job);
    return job;
  };
  const queue = {
    name: "email-queue",
    opts: { prefix: "bull" },
    getJobs: vi.fn(async () => [...jobs.values()].filter((job) => job.state === "completed")),
    getJob: vi.fn(async (id: string) => jobs.get(id)),
    getJobCounts: counts,
  } as unknown as CleanupQueue;
  const emailStore: CleanupEmailStore = {
    findMany: vi.fn(async ({ where }) => where.id.in.filter((id) => records.has(id)).map((id) => ({ id }))),
  };
  return { queue, emailStore, addJob, jobs, removed, counts, records };
}

describe("orphaned completed job maintenance", () => {
  beforeEach(() => vi.clearAllMocks());

  it("defaults to dry-run behavior and reports candidates and database matches", async () => {
    const fixture = makeFixture(["email-kept"]);
    fixture.addJob("orphan");
    fixture.addJob("job-with-email", "completed", "email-kept");
    const lines: string[] = [];

    const result = await runOrphanJobCleanup({
      queue: fixture.queue,
      emailStore: fixture.emailStore,
      confirmDelete: false,
      write: (line) => lines.push(line),
    });

    expect(result.removed).toBe(0);
    expect(result.candidates).toMatchObject([
      { jobId: "orphan", state: "completed", databaseMatch: { matched: false }, eligible: true },
      { jobId: "job-with-email", state: "completed", databaseMatch: { matched: true, emailIds: ["email-kept"] }, eligible: false },
    ]);
    expect(fixture.removed).toEqual([]);
    expect(lines.some((line) => line.includes("DRY-RUN"))).toBe(true);
    expect(lines.some((line) => line.includes('"completed":2'))).toBe(true);
  });

  it("removes only individually reverified completed jobs without matching Email rows", async () => {
    const fixture = makeFixture(["email-kept"]);
    fixture.addJob("orphan");
    fixture.addJob("job-with-email", "completed", "email-kept");

    const result = await runOrphanJobCleanup({
      queue: fixture.queue,
      emailStore: fixture.emailStore,
      confirmDelete: true,
      write: () => undefined,
    });

    expect(result.removed).toBe(1);
    expect(fixture.removed).toEqual(["orphan"]);
    expect(fixture.jobs.has("job-with-email")).toBe(true);
  });

  it("skips a job whose state changes before the deletion recheck", async () => {
    const fixture = makeFixture();
    const job = fixture.addJob("state-changed");
    let stateReads = 0;
    job.getState = async () => {
      stateReads += 1;
      if (stateReads >= 3) job.state = "waiting";
      return job.state;
    };

    const result = await runOrphanJobCleanup({
      queue: fixture.queue,
      emailStore: fixture.emailStore,
      confirmDelete: true,
      write: () => undefined,
    });

    expect(result.removed).toBe(0);
    expect(fixture.removed).toEqual([]);
  });

  it("uses the production runtime guard and rejects local Redis", async () => {
    mocks.env.NODE_ENV = "production";
    mocks.env.REDIS_HOST = "localhost";
    expect(assertProductionConnection).toThrow(/local Redis/);
  });
});
