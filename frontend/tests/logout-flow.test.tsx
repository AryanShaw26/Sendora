import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";

const mocks = vi.hoisted(() => ({
  getMe: vi.fn(),
  logout: vi.fn(),
  getSlackStatus: vi.fn(async () => ({ connected: false })),
  getSenders: vi.fn(async () => ({ items: [] })),
  getSlackConnectUrl: vi.fn(),
  disconnectSlack: vi.fn(),
  sendTestSlackAlert: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("../src/api/client", () => ({
  getMe: mocks.getMe,
  logout: mocks.logout,
  getSlackStatus: mocks.getSlackStatus,
  getSenders: mocks.getSenders,
  getSlackConnectUrl: mocks.getSlackConnectUrl,
  disconnectSlack: mocks.disconnectSlack,
  sendTestSlackAlert: mocks.sendTestSlackAlert,
}));
vi.mock("react-hot-toast", () => ({ default: { error: mocks.toastError } }));

import { AuthProvider } from "../src/context/AuthContext";
import { LandingPage } from "../src/pages/LandingPage";
import { SettingsPage } from "../src/pages/SettingsPage";
import { ProtectedRoute } from "../src/routes/ProtectedRoute";

const currentUser = {
  id: "user-1",
  email: "signed-in@example.test",
  name: "Signed In User",
  avatarUrl: null,
};
let backendSessionActive = true;

function LandingWithHistoryBack() {
  const navigate = useNavigate();
  return (
    <>
      <LandingPage />
      <button onClick={() => navigate(-1)}>Simulate browser back</button>
    </>
  );
}

function renderFlow(initialEntries: string[] = ["/dashboard/settings"], client = new QueryClient({
  defaultOptions: { queries: { retry: false } },
})) {
  return {
    client,
    ...render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={initialEntries} initialIndex={initialEntries.length - 1}>
          <AuthProvider>
            <Routes>
              <Route path="/" element={<LandingWithHistoryBack />} />
              <Route path="/login" element={<div>Login page</div>} />
              <Route element={<ProtectedRoute />}>
                <Route path="/dashboard" element={<div>Private dashboard content</div>} />
                <Route path="/dashboard/settings" element={<SettingsPage />} />
              </Route>
            </Routes>
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  };
}

describe("browser logout flow", () => {
  beforeEach(() => {
    backendSessionActive = true;
    mocks.getMe.mockReset().mockImplementation(async () => {
      if (!backendSessionActive) throw new Error("Authentication required");
      return currentUser;
    });
    mocks.logout.mockReset().mockImplementation(async () => {
      backendSessionActive = false;
    });
    mocks.toastError.mockReset();
  });

  afterEach(() => cleanup());

  it("waits for backend logout, clears auth state, and shows the signed-out landing page", async () => {
    let finishLogout!: () => void;
    mocks.logout.mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => { finishLogout = resolve; });
      backendSessionActive = false;
    });
    renderFlow(["/dashboard", "/dashboard/settings"]);

    expect(await screen.findByText("signed-in@example.test")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(mocks.logout).toHaveBeenCalledOnce();
    expect(screen.getByText("signed-in@example.test")).toBeTruthy();

    finishLogout();
    expect(await screen.findByRole("button", { name: "Sign in" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Get started" })).toBeTruthy();
    expect(screen.queryByText("Open dashboard")).toBeNull();
    expect(screen.queryByText("signed-in@example.test")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Simulate browser back" }));
    expect(await screen.findByText("Login page")).toBeTruthy();
    expect(screen.queryByText("Private dashboard content")).toBeNull();
  });

  it("does not restore a session after a browser refresh", async () => {
    const firstMount = renderFlow();
    expect(await screen.findByText("signed-in@example.test")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(await screen.findByRole("button", { name: "Sign in" })).toBeTruthy();
    firstMount.unmount();

    mocks.getMe.mockRejectedValueOnce(new Error("Authentication required"));
    renderFlow(["/dashboard"]);
    expect(await screen.findByText("Login page")).toBeTruthy();
    expect(screen.queryByText("Private dashboard content")).toBeNull();
  });

  it("keeps the current session visible and reports a failed logout request", async () => {
    mocks.logout.mockRejectedValueOnce(new Error("Network unavailable"));
    renderFlow();
    expect(await screen.findByText("signed-in@example.test")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    await Promise.resolve();
    expect(mocks.toastError).toHaveBeenCalledWith("Could not sign out. Please try again.");
    expect(screen.getByText("signed-in@example.test")).toBeTruthy();
    expect(mocks.logout).toHaveBeenCalledOnce();
  });
});
