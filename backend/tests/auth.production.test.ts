import axios from "axios";
import express from "express";
import http from "http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAuthRouter } from "../src/routes/auth.routes";

describe("Production authentication routes", () => {
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    const app = express();
    app.use("/auth", createAuthRouter("production"));
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Test server did not bind to a TCP port");
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  it("does not expose development login in production", async () => {
    const response = await axios.get(`${baseUrl}/auth/dev-login`, {
      validateStatus: () => true,
    });
    expect(response.status).toBe(404);
  });
});
