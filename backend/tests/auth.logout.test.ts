import express from "express";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import axios from "axios";
import http from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  env: {
    NODE_ENV: "production",
    LOG_LEVEL: "silent",
    COOKIE_SECURE: true,
    FRONTEND_URL: "https://app.sendora.test",
    GOOGLE_CLIENT_ID: "google-client-id",
    GOOGLE_CLIENT_SECRET: "google-client-secret",
    JWT_SECRET: "test-only-auth-logout-jwt-secret",
  },
  getGoogleAuthUrl: vi.fn((state: string) => `https://accounts.google.test/auth?state=${state}`),
  handleGoogleCallback: vi.fn(),
  getOrCreateDevUser: vi.fn(),
  userFindUnique: vi.fn(async () => ({
    id: "google-user",
    email: "google-user@example.test",
    name: "Google User",
    avatarUrl: null,
  })),
}));

vi.mock("../src/config/env", () => ({ env: mocks.env }));
vi.mock("../src/services/auth.service", () => ({
  getGoogleAuthUrl: mocks.getGoogleAuthUrl,
  handleGoogleCallback: mocks.handleGoogleCallback,
  getOrCreateDevUser: mocks.getOrCreateDevUser,
}));
vi.mock("../src/db/prisma", () => ({ prisma: { user: { findUnique: mocks.userFindUnique } } }));

import { authMiddleware } from "../src/middleware/auth";
import { createAuthRouter } from "../src/routes/auth.routes";

describe("Google session logout", () => {
  let server: http.Server;
  let baseUrl: string;
  const sessionToken = jwt.sign({ sub: "google-user" }, mocks.env.JWT_SECRET);

  beforeAll(async () => {
    mocks.handleGoogleCallback.mockResolvedValue({ token: sessionToken });
    const app = express();
    app.use(cookieParser());
    app.use("/auth", createAuthRouter("production"));
    app.get("/api/me", authMiddleware, (req, res) => res.json(req.user));
    app.get("/api/protected", authMiddleware, (_req, res) => res.json({ protected: true }));
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address() as { port: number };
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });

  beforeEach(() => {
    mocks.userFindUnique.mockClear();
    mocks.handleGoogleCallback.mockClear().mockResolvedValue({ token: sessionToken });
  });

  it("preserves Google OAuth and issues a root-scoped production session cookie", async () => {
    const start = await axios.get(`${baseUrl}/auth/google`, { maxRedirects: 0, validateStatus: () => true });
    expect(start.status).toBe(302);
    expect(start.headers.location).toContain("https://accounts.google.test/auth");
    const stateCookie = start.headers["set-cookie"]?.find((cookie: string) => cookie.startsWith("oauth_state="));
    expect(stateCookie).toBeDefined();
    const state = stateCookie!.split(";")[0].split("=")[1];

    const callback = await axios.get(`${baseUrl}/auth/google/callback`, {
      params: { code: "test-code", state },
      headers: { Cookie: `oauth_state=${state}` },
      maxRedirects: 0,
      validateStatus: () => true,
    });
    expect(callback.status).toBe(302);
    expect(callback.headers.location).toBe("https://app.sendora.test/dashboard");
    const tokenCookie = callback.headers["set-cookie"]?.find((cookie: string) => cookie.startsWith("token="));
    expect(tokenCookie).toMatch(/HttpOnly/i);
    expect(tokenCookie).toMatch(/Secure/i);
    expect(tokenCookie).toMatch(/SameSite=None/i);
    expect(tokenCookie).toMatch(/Path=\//i);
    expect(tokenCookie).not.toMatch(/Domain=/i);
  });

  it("clears matching cookie attributes and leaves /api/me and protected routes unauthenticated", async () => {
    const meBeforeLogout = await axios.get(`${baseUrl}/api/me`, {
      headers: { Cookie: `token=${sessionToken}` },
    });
    expect(meBeforeLogout.status).toBe(200);

    const response = await axios.post(`${baseUrl}/auth/logout`, null, {
      headers: { Cookie: `token=${sessionToken}` },
    });
    expect(response.status).toBe(200);
    expect(response.data).toEqual({ success: true, message: "Logged out successfully" });

    const clearedCookie = response.headers["set-cookie"]?.find((cookie: string) => cookie.startsWith("token=;"));
    expect(clearedCookie).toBeDefined();
    expect(clearedCookie).toMatch(/HttpOnly/i);
    expect(clearedCookie).toMatch(/Secure/i);
    expect(clearedCookie).toMatch(/SameSite=None/i);
    expect(clearedCookie).toMatch(/Path=\//i);
    expect(clearedCookie).toMatch(/Expires=Thu, 01 Jan 1970/i);
    expect(clearedCookie).not.toMatch(/Domain=/i);

    const meAfterLogout = await axios.get(`${baseUrl}/api/me`, { validateStatus: () => true });
    const protectedAfterLogout = await axios.get(`${baseUrl}/api/protected`, { validateStatus: () => true });
    expect(meAfterLogout.status).toBe(401);
    expect(meAfterLogout.data.error.code).toBe("UNAUTHORIZED");
    expect(protectedAfterLogout.status).toBe(401);
  });
});
