import {
  ActivityAction,
  TaskPriority,
  TaskStatus
} from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TasksService } from "./tasks.service.js";

function createTasksContext() {
  const transactionClient = {
    task: {
      update: vi.fn()
    },
    taskComment: {
      create: vi.fn()
    },
    activityLog: {
      create: vi.fn()
    }
  };
  const prisma = {
    task: {
      findFirst: vi.fn()
    },
    $transaction: vi.fn(async (callback: (tx: typeof transactionClient) => unknown) =>
      callback(transactionClient)
    )
  };
  const authService = {
    requireUserFromAuthorization: vi.fn()
  };

  authService.requireUserFromAuthorization.mockResolvedValue({
    id: "user-1"
  });

  return {
    prisma,
    authService,
    transactionClient,
    service: new TasksService(prisma as never, authService as never)
  };
}

describe("TasksService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("records TASK_MOVED activity when a task status changes", async () => {
    const { prisma, service, transactionClient } = createTasksContext();

    prisma.task.findFirst.mockResolvedValue({
      id: "task-1",
      projectId: "project-1",
      boardId: "board-1",
      title: "Ship CI pipeline",
      status: TaskStatus.TODO,
      priority: TaskPriority.MEDIUM
    });
    transactionClient.task.update.mockResolvedValue({
      id: "task-1",
      projectId: "project-1",
      boardId: "board-1",
      title: "Ship CI pipeline",
      status: TaskStatus.DONE,
      priority: TaskPriority.MEDIUM,
      assignee: null,
      dueDate: null
    });

    const result = await service.update(
      "task-1",
      {
        status: TaskStatus.DONE
      },
      "Bearer access-token"
    );

    expect(result.status).toBe(TaskStatus.DONE);
    expect(transactionClient.activityLog.create).toHaveBeenCalledWith({
      data: {
        projectId: "project-1",
        taskId: "task-1",
        actorId: "user-1",
        action: ActivityAction.TASK_MOVED,
        metadata: {
          from: TaskStatus.TODO,
          to: TaskStatus.DONE
        }
      }
    });
  });

  it("records UPDATED activity when editing non-status fields", async () => {
    const { prisma, service, transactionClient } = createTasksContext();

    prisma.task.findFirst.mockResolvedValue({
      id: "task-1",
      projectId: "project-1",
      boardId: "board-1",
      title: "Ship CI pipeline",
      status: TaskStatus.TODO,
      priority: TaskPriority.MEDIUM
    });
    transactionClient.task.update.mockResolvedValue({
      id: "task-1",
      projectId: "project-1",
      boardId: "board-1",
      title: "Refine CI pipeline",
      status: TaskStatus.TODO,
      priority: TaskPriority.HIGH,
      assignee: null,
      dueDate: null
    });

    await service.update(
      "task-1",
      {
        title: "  Refine CI pipeline  ",
        priority: TaskPriority.HIGH
      },
      "Bearer access-token"
    );

    expect(transactionClient.task.update).toHaveBeenCalledWith({
      where: {
        id: "task-1"
      },
      data: {
        title: "Refine CI pipeline",
        status: undefined,
        priority: TaskPriority.HIGH
      },
      include: {
        assignee: {
          select: {
            displayName: true
          }
        }
      }
    });
    expect(transactionClient.activityLog.create).toHaveBeenCalledWith({
      data: {
        projectId: "project-1",
        taskId: "task-1",
        actorId: "user-1",
        action: ActivityAction.UPDATED,
        metadata: {
          entity: "task",
          updatedFields: ["title", "priority"]
        }
      }
    });
  });

  it("creates trimmed comments and logs COMMENTED activity", async () => {
    const { prisma, service, transactionClient } = createTasksContext();

    prisma.task.findFirst.mockResolvedValue({
      id: "task-1",
      projectId: "project-1"
    });
    transactionClient.taskComment.create.mockResolvedValue({
      id: "comment-1",
      taskId: "task-1",
      body: "Looks good",
      createdAt: new Date("2026-04-06T08:30:00.000Z"),
      author: {
        displayName: "Demo User",
        email: "demo@taskflow.local"
      }
    });

    const comment = await service.createComment(
      "task-1",
      "  Looks good  ",
      "Bearer access-token"
    );

    expect(transactionClient.taskComment.create).toHaveBeenCalledWith({
      data: {
        taskId: "task-1",
        authorId: "user-1",
        body: "Looks good"
      },
      include: {
        author: {
          select: {
            displayName: true,
            email: true
          }
        }
      }
    });
    expect(transactionClient.activityLog.create).toHaveBeenCalledWith({
      data: {
        projectId: "project-1",
        taskId: "task-1",
        actorId: "user-1",
        action: ActivityAction.COMMENTED,
        metadata: {
          entity: "comment",
          commentId: "comment-1"
        }
      }
    });
    expect(comment.body).toBe("Looks good");
  });
});
