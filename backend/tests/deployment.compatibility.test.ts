import axios from "axios";
import http from "http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { env } from "../src/config/env";
import { prisma } from "../src/db/prisma";
import { getRedisConfig } from "../src/redis/connection";
import { signUserToken } from "../src/services/auth.service";
import {
  ensureIndex,
  indexEmails,
  searchEmails,
} from "../src/services/search.service";

describe("Production deployment compatibility", () => {
  let server: http.Server;
  let baseUrl: string;
  let token: string;
  const originalElasticsearchEnabled = env.ELASTICSEARCH_ENABLED;

  beforeAll(async () => {
    const user = await prisma.user.upsert({
      where: { email: "deployment-compatibility@sendora.local" },
      update: {},
      create: {
        googleId: "deployment-compatibility-google-id",
        email: "deployment-compatibility@sendora.local",
        name: "Deployment Compatibility",
      },
      select: { id: true },
    });
    token = signUserToken(user.id);

    const app = createApp();
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Test server did not bind to a TCP port");
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    (env as { ELASTICSEARCH_ENABLED: boolean }).ELASTICSEARCH_ENABLED =
      originalElasticsearchEnabled;
    if (!server) return;
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  it("supports unauthenticated, non-TLS Redis configuration", () => {
    (env as { REDIS_PASSWORD: string }).REDIS_PASSWORD = "";
    (env as { REDIS_TLS: boolean }).REDIS_TLS = false;

    const redisConfig = getRedisConfig();
    expect(redisConfig.password).toBeUndefined();
    expect(redisConfig.tls).toBeUndefined();
  });

  it("keeps health operational and search clearly unavailable when Elasticsearch is disabled", async () => {
    (env as { ELASTICSEARCH_ENABLED: boolean }).ELASTICSEARCH_ENABLED = false;

    await expect(ensureIndex()).resolves.toBeUndefined();
    await expect(indexEmails([])).resolves.toBeUndefined();
    await expect(
      searchEmails({ userId: "test-user", q: "test" }),
    ).rejects.toThrow("Elasticsearch search is disabled");

    const health = await axios.get(`${baseUrl}/health`, {
      validateStatus: () => true,
    });
    expect(health.data.db).toBe("up");
    expect(health.data.redis).toBe("up");
    expect(health.data.elasticsearch).toBe("disabled");
    expect(health.status).toBe(200);

    const search = await axios.get(`${baseUrl}/api/emails/search?q=test`, {
      headers: { Cookie: `token=${token}` },
      validateStatus: () => true,
    });
    expect(search.status).toBe(503);
    expect(search.data.error.code).toBe("SEARCH_DISABLED");
  });
});
