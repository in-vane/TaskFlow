import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { jsonResponse, renderWithAppProviders } from "./test/test-utils";

describe("App interactions", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("lets a user sign in, filter tasks, switch lanes, and post a comment", async () => {
    const project = {
      id: "project-1",
      key: "WEB",
      name: "Website Revamp",
      role: "OWNER",
      boardCount: 3,
      taskCount: 3
    };
    const boards = [
      {
        id: "board-backlog",
        projectId: "project-1",
        name: "Backlog",
        position: 1,
        taskCount: 1,
        createdAt: "2026-04-06T08:00:00.000Z",
        updatedAt: "2026-04-06T08:00:00.000Z"
      },
      {
        id: "board-progress",
        projectId: "project-1",
        name: "In Progress",
        position: 2,
        taskCount: 1,
        createdAt: "2026-04-06T08:00:00.000Z",
        updatedAt: "2026-04-06T08:00:00.000Z"
      },
      {
        id: "board-done",
        projectId: "project-1",
        name: "Done",
        position: 3,
        taskCount: 1,
        createdAt: "2026-04-06T08:00:00.000Z",
        updatedAt: "2026-04-06T08:00:00.000Z"
      }
    ];
    const tasks = [
      {
        id: "task-backlog",
        projectId: "project-1",
        boardId: "board-backlog",
        title: "Design landing page copy",
        status: "TODO",
        priority: "MEDIUM",
        assigneeName: "Demo User"
      },
      {
        id: "task-progress",
        projectId: "project-1",
        boardId: "board-progress",
        title: "Implement auth screen",
        status: "IN_PROGRESS",
        priority: "HIGH",
        assigneeName: "Demo User"
      },
      {
        id: "task-done",
        projectId: "project-1",
        boardId: "board-done",
        title: "Prepare release notes",
        status: "DONE",
        priority: "URGENT",
        assigneeName: "Reviewer Bot"
      }
    ];
    const taskDetails = {
      "task-backlog": {
        id: "task-backlog",
        title: "Design landing page copy",
        description: null,
        status: "TODO",
        priority: "MEDIUM",
        createdAt: "2026-04-06T08:00:00.000Z",
        updatedAt: "2026-04-06T08:00:00.000Z",
        project: {
          id: "project-1",
          key: "WEB",
          name: "Website Revamp"
        },
        board: {
          id: "board-backlog",
          name: "Backlog"
        },
        assignee: {
          id: "user-1",
          displayName: "Demo User",
          email: "demo@taskflow.local"
        },
        comments: []
      },
      "task-done": {
        id: "task-done",
        title: "Prepare release notes",
        description: "Collect the final release summary for launch day.",
        status: "DONE",
        priority: "URGENT",
        createdAt: "2026-04-06T08:00:00.000Z",
        updatedAt: "2026-04-06T08:00:00.000Z",
        project: {
          id: "project-1",
          key: "WEB",
          name: "Website Revamp"
        },
        board: {
          id: "board-done",
          name: "Done"
        },
        assignee: {
          id: "user-2",
          displayName: "Reviewer Bot",
          email: "reviewer@taskflow.local"
        },
        comments: []
      }
    };
    let activity = [
      {
        id: "activity-1",
        projectId: "project-1",
        taskId: "task-done",
        action: "UPDATED",
        actorName: "Reviewer Bot",
        actorEmail: "reviewer@taskflow.local",
        taskTitle: "Prepare release notes",
        metadata: {
          entity: "task"
        },
        createdAt: "2026-04-06T08:10:00.000Z"
      }
    ];

    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);

      if (url === "/api/health/live") {
        return jsonResponse({
          status: "ok",
          timestamp: "2026-04-06T08:00:00.000Z"
        });
      }

      if (url === "/api/auth/login") {
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
          projects: [
            {
              id: "project-1",
              key: "WEB",
              name: "Website Revamp",
              role: "OWNER"
            }
          ]
        });
      }

      if (url === "/api/projects") {
        return jsonResponse([project]);
      }

      if (url === "/api/projects/project-1/boards") {
        return jsonResponse(boards);
      }

      if (url === "/api/projects/project-1/tasks") {
        return jsonResponse(tasks);
      }

      if (url === "/api/projects/project-1/activity") {
        return jsonResponse(activity);
      }

      if (url === "/api/tasks/task-backlog") {
        return jsonResponse(taskDetails["task-backlog"]);
      }

      if (url === "/api/tasks/task-done") {
        return jsonResponse(taskDetails["task-done"]);
      }

      if (url === "/api/tasks/task-done/comments" && init?.method === "POST") {
        const newComment = {
          id: "comment-1",
          taskId: "task-done",
          body: "Ship it",
          authorName: "Demo User",
          authorEmail: "demo@taskflow.local",
          createdAt: "2026-04-06T09:00:00.000Z"
        };

        taskDetails["task-done"] = {
          ...taskDetails["task-done"],
          comments: [...taskDetails["task-done"].comments, newComment],
          updatedAt: "2026-04-06T09:00:00.000Z"
        };
        activity = [
          {
            id: "activity-2",
            projectId: "project-1",
            taskId: "task-done",
            action: "COMMENTED",
            actorName: "Demo User",
            actorEmail: "demo@taskflow.local",
            taskTitle: "Prepare release notes",
            metadata: {
              entity: "comment",
              commentId: "comment-1"
            },
            createdAt: "2026-04-06T09:00:00.000Z"
          },
          ...activity
        ];

        return jsonResponse(newComment);
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

    expect(await screen.findByText("Website Revamp")).toBeInTheDocument();
    expect(
      await screen.findByRole("heading", {
        name: "Design landing page copy"
      })
    ).toBeInTheDocument();

    await user.type(
      screen.getByRole("textbox", {
        name: "Search"
      }),
      "release"
    );

    expect(await screen.findByText("1 of 3 visible")).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", {
        name: /Prepare release notes/
      })
    );

    expect(
      await screen.findByRole("heading", {
        name: "Prepare release notes"
      })
    ).toBeInTheDocument();
    expect(
      screen.getByText("Collect the final release summary for launch day.")
    ).toBeInTheDocument();

    await user.type(
      screen.getByRole("textbox", {
        name: "Add Comment"
      }),
      "Ship it"
    );
    await user.click(
      screen.getByRole("button", {
        name: "Post Comment"
      })
    );

    expect(await screen.findByText("Ship it")).toBeInTheDocument();
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/tasks/task-done/comments",
        expect.objectContaining({
          method: "POST"
        })
      );
    });
  });
});
