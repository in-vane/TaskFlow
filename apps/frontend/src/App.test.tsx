import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { SESSION_STORAGE_KEY } from "./lib/app-utils";
import { jsonResponse, renderWithAppProviders } from "./test/test-utils";

describe("App", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("renders API health and the sign-in form for signed-out users", async () => {
    fetchMock.mockImplementation(async (input) => {
      if (String(input) === "/api/health/live") {
        return jsonResponse({
          status: "ok",
          timestamp: "2026-04-06T08:00:00.000Z"
        });
      }

      throw new Error(`Unexpected fetch request: ${String(input)}`);
    });

    renderWithAppProviders(<App />);

    expect(
      await screen.findByRole("heading", {
        name: "Sign In"
      })
    ).toBeInTheDocument();
    expect(await screen.findByText("ok")).toBeInTheDocument();
    expect(screen.getByDisplayValue("demo@taskflow.local")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/health/live");
  });

  it("signs in successfully and persists the returned session", async () => {
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);

      if (url === "/api/health/live") {
        return jsonResponse({
          status: "ok",
          timestamp: "2026-04-06T08:00:00.000Z"
        });
      }

      if (url === "/api/auth/login") {
        expect(init?.method).toBe("POST");

        return jsonResponse({
          accessToken: "access-token",
          refreshToken: "refresh-token",
          user: {
            id: "user-1",
            email: "demo@taskflow.local",
            displayName: "Demo User"
          }
        });
      }

      if (url === "/api/me") {
        return jsonResponse({
          id: "user-1",
          email: "demo@taskflow.local",
          displayName: "Demo User",
          createdAt: "2026-04-06T08:00:00.000Z",
          updatedAt: "2026-04-06T08:00:00.000Z",
          projects: []
        });
      }

      if (url === "/api/projects") {
        return jsonResponse([]);
      }

      throw new Error(`Unexpected fetch request: ${url}`);
    });

    const user = userEvent.setup();
    renderWithAppProviders(<App />);

    await user.click(
      await screen.findByRole("button", {
        name: "Sign In"
      })
    );

    expect(
      await screen.findByRole("button", {
        name: "Sign Out"
      })
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(window.localStorage.getItem(SESSION_STORAGE_KEY)).toContain(
        "\"accessToken\":\"access-token\""
      );
    });
  });
});
