import type { ProjectActivityEntry, TaskSummary } from "@taskflow/shared-types";
import { describe, expect, it } from "vitest";
import {
  SESSION_STORAGE_KEY,
  getActivityMeta,
  getActivityTitle,
  loadSession,
  matchesTaskFilters,
  normalizeProjectKey,
  persistSession
} from "./app-utils";

describe("app-utils", () => {
  it("normalizes project keys to uppercase alphanumeric values", () => {
    expect(normalizeProjectKey(" task-flow_2026 ")).toBe("TASKFLOW");
    expect(normalizeProjectKey("qa-12")).toBe("QA12");
  });

  it("persists sessions and clears invalid serialized values", () => {
    persistSession({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      user: {
        id: "user-1",
        email: "demo@taskflow.local",
        displayName: "Demo User"
      }
    });

    expect(loadSession()).toEqual({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      user: {
        id: "user-1",
        email: "demo@taskflow.local",
        displayName: "Demo User"
      }
    });

    window.localStorage.setItem(SESSION_STORAGE_KEY, "{invalid json");

    expect(loadSession()).toBeNull();
    expect(window.localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
  });

  it("matches tasks against search, status, and priority filters", () => {
    const task: TaskSummary = {
      id: "task-1",
      projectId: "project-1",
      boardId: "board-1",
      title: "Ship CI pipeline",
      status: "IN_PROGRESS",
      priority: "HIGH",
      assigneeName: "Demo User"
    };

    expect(
      matchesTaskFilters(task, {
        search: "demo",
        status: "ALL",
        priority: "ALL"
      })
    ).toBe(true);
    expect(
      matchesTaskFilters(task, {
        search: "pipeline",
        status: "IN_PROGRESS",
        priority: "HIGH"
      })
    ).toBe(true);
    expect(
      matchesTaskFilters(task, {
        search: "design",
        status: "ALL",
        priority: "ALL"
      })
    ).toBe(false);
  });

  it("formats project activity titles and metadata", () => {
    const activity: ProjectActivityEntry = {
      id: "activity-1",
      projectId: "project-1",
      taskId: "task-1",
      action: "TASK_MOVED",
      actorName: "Demo User",
      actorEmail: "demo@taskflow.local",
      taskTitle: "Ship CI pipeline",
      metadata: {
        from: "TODO",
        to: "DONE"
      },
      createdAt: "2026-04-06T08:15:00.000Z"
    };

    expect(getActivityTitle(activity)).toBe(
      "Demo User moved Ship CI pipeline from TODO to DONE"
    );
    expect(getActivityMeta(activity)).toContain("demo@taskflow.local");
  });
});
