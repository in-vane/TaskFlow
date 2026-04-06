import type { INestApplication } from "@nestjs/common";
import { TaskPriority, TaskStatus } from "@prisma/client";
import { AuthService } from "../auth/auth.service.js";
import {
  CreateCommentDto,
  CreateTaskDto,
  TasksController,
  UpdateTaskDto
} from "./tasks.controller.js";
import { TasksService } from "./tasks.service.js";
import { PrismaService } from "../../prisma/prisma.service.js";
import { createTestApp, createTestingModule } from "../../test/create-test-app.js";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

function createTaskPrismaMock() {
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

  return {
    transactionClient,
    prisma: {
      task: {
        findFirst: vi.fn()
      },
      $transaction: vi.fn(
        async (callback: (tx: typeof transactionClient) => Promise<unknown>) =>
          callback(transactionClient)
      )
    }
  };
}

Reflect.defineMetadata("design:paramtypes", [TasksService], TasksController);
Reflect.defineMetadata(
  "design:paramtypes",
  [PrismaService, AuthService],
  TasksService
);
Reflect.defineMetadata(
  "design:paramtypes",
  [String, String],
  TasksController.prototype,
  "findByProject"
);
Reflect.defineMetadata(
  "design:paramtypes",
  [String, String],
  TasksController.prototype,
  "findOne"
);
Reflect.defineMetadata(
  "design:paramtypes",
  [CreateTaskDto, String],
  TasksController.prototype,
  "create"
);
Reflect.defineMetadata(
  "design:paramtypes",
  [String, UpdateTaskDto, String],
  TasksController.prototype,
  "update"
);
Reflect.defineMetadata(
  "design:paramtypes",
  [String, CreateCommentDto, String],
  TasksController.prototype,
  "createComment"
);

describe("Tasks HTTP", () => {
  let app: INestApplication | null = null;

  afterEach(async () => {
    await app?.close();
    app = null;
  });

  it("rejects invalid task status updates with HTTP 400", async () => {
    const { prisma } = createTaskPrismaMock();
    const authService = {
      requireUserFromAuthorization: vi.fn()
    };

    app = await createTestApp(() =>
      createTestingModule({
        controllers: [TasksController],
        providers: [
          TasksService,
          {
            provide: AuthService,
            useValue: authService
          },
          {
            provide: PrismaService,
            useValue: prisma
          }
        ]
      }).compile()
    );

    const response = await request(app.getHttpServer())
      .patch("/api/tasks/task-1")
      .set("authorization", "Bearer access-token")
      .send({
        status: "BLOCKED"
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toContain(
      "status must be one of the following values: BACKLOG, TODO, IN_PROGRESS, DONE"
    );
  });

  it("creates comments through the HTTP layer and returns the trimmed payload", async () => {
    const { prisma, transactionClient } = createTaskPrismaMock();
    const authService = {
      requireUserFromAuthorization: vi.fn()
    };

    authService.requireUserFromAuthorization.mockResolvedValue({
      id: "user-1"
    });
    prisma.task.findFirst.mockResolvedValue({
      id: "task-1",
      projectId: "project-1",
      boardId: "board-1",
      title: "Prepare release notes",
      status: TaskStatus.TODO,
      priority: TaskPriority.MEDIUM
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

    app = await createTestApp(() =>
      createTestingModule({
        controllers: [TasksController],
        providers: [
          TasksService,
          {
            provide: AuthService,
            useValue: authService
          },
          {
            provide: PrismaService,
            useValue: prisma
          }
        ]
      }).compile()
    );

    const response = await request(app.getHttpServer())
      .post("/api/tasks/task-1/comments")
      .set("authorization", "Bearer access-token")
      .send({
        body: "  Looks good  "
      });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      id: "comment-1",
      taskId: "task-1",
      body: "Looks good",
      authorName: "Demo User",
      authorEmail: "demo@taskflow.local",
      createdAt: "2026-04-06T08:30:00.000Z"
    });
    expect(transactionClient.activityLog.create).toHaveBeenCalledWith({
      data: {
        projectId: "project-1",
        taskId: "task-1",
        actorId: "user-1",
        action: "COMMENTED",
        metadata: {
          entity: "comment",
          commentId: "comment-1"
        }
      }
    });
  });
});
