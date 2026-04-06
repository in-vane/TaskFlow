import {
  ActivityAction,
  TaskPriority,
  TaskStatus
} from "@prisma/client";
import {
  ForbiddenException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import type { TaskSummary } from "@taskflow/shared-types";
import { AuthService } from "../auth/auth.service.js";
import { PrismaService } from "../../prisma/prisma.service.js";

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService
  ) {}

  async findByProject(
    projectId: string,
    authorization?: string
  ): Promise<TaskSummary[]> {
    const user = await this.authService.requireUserFromAuthorization(authorization);
    await this.requireProjectMembership(projectId, user.id);

    const tasks = await this.prisma.task.findMany({
      where: {
        projectId
      },
      include: {
        assignee: {
          select: {
            displayName: true
          }
        },
        board: {
          select: {
            position: true
          }
        }
      },
      orderBy: [
        {
          board: {
            position: "asc"
          }
        },
        {
          createdAt: "asc"
        }
      ]
    });

    return tasks.map((task) => this.mapTaskSummary(task));
  }

  async findOne(id: string, authorization?: string) {
    const user = await this.authService.requireUserFromAuthorization(authorization);
    const task = await this.prisma.task.findFirst({
      where: {
        id,
        project: {
          memberships: {
            some: {
              userId: user.id
            }
          }
        }
      },
      include: {
        assignee: {
          select: {
            id: true,
            displayName: true,
            email: true
          }
        },
        board: {
          select: {
            id: true,
            name: true
          }
        },
        project: {
          select: {
            id: true,
            key: true,
            name: true
          }
        },
        comments: {
          include: {
            author: {
              select: {
                id: true,
                displayName: true,
                email: true
              }
            }
          },
          orderBy: {
            createdAt: "asc"
          }
        }
      }
    });

    if (!task) {
      throw new NotFoundException(`Task ${id} was not found`);
    }

    return {
      id: task.id,
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      dueDate: task.dueDate?.toISOString(),
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
      project: task.project,
      board: task.board,
      assignee: task.assignee
        ? {
            id: task.assignee.id,
            displayName: task.assignee.displayName,
            email: task.assignee.email
          }
        : null,
      comments: task.comments.map((comment) => ({
        id: comment.id,
        body: comment.body,
        authorName: comment.author.displayName,
        authorEmail: comment.author.email,
        createdAt: comment.createdAt.toISOString()
      }))
    };
  }

  async create(
    dto: { title: string; projectId: string; boardId: string },
    authorization?: string
  ) {
    const user = await this.authService.requireUserFromAuthorization(authorization);
    await this.requireProjectMembership(dto.projectId, user.id);
    const board = await this.prisma.board.findFirst({
      where: {
        id: dto.boardId,
        projectId: dto.projectId
      }
    });

    if (!board || board.projectId !== dto.projectId) {
      throw new NotFoundException(
        `Board ${dto.boardId} was not found in project ${dto.projectId}`
      );
    }

    const task = await this.prisma.$transaction(async (tx) => {
      const createdTask = await tx.task.create({
        data: {
          projectId: dto.projectId,
          boardId: dto.boardId,
          title: dto.title.trim(),
          status: TaskStatus.TODO,
          priority: TaskPriority.MEDIUM
        },
        include: {
          assignee: {
            select: {
              displayName: true
            }
          }
        }
      });

      await tx.activityLog.create({
        data: {
          projectId: dto.projectId,
          taskId: createdTask.id,
          actorId: user.id,
          action: ActivityAction.CREATED,
          metadata: {
            entity: "task",
            title: createdTask.title,
            boardId: createdTask.boardId
          }
        }
      });

      return createdTask;
    });

    return this.mapTaskSummary(task);
  }

  update(
    id: string,
    dto: Partial<{
      title: string;
      status: TaskStatus;
      priority: TaskPriority;
    }>,
    authorization?: string
  ) {
    return this.updateTask(id, dto, authorization);
  }

  async createComment(taskId: string, body: string, authorization?: string) {
    const currentUser = await this.authService.requireUserFromAuthorization(
      authorization
    );
    const task = await this.prisma.task.findFirst({
      where: {
        id: taskId,
        project: {
          memberships: {
            some: {
              userId: currentUser.id
            }
          }
        }
      }
    });

    if (!task) {
      throw new NotFoundException(`Task ${taskId} was not found`);
    }

    const comment = await this.prisma.$transaction(async (tx) => {
      const createdComment = await tx.taskComment.create({
        data: {
          taskId,
          authorId: currentUser.id,
          body: body.trim()
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

      await tx.activityLog.create({
        data: {
          projectId: task.projectId,
          taskId,
          actorId: currentUser.id,
          action: ActivityAction.COMMENTED,
          metadata: {
            entity: "comment",
            commentId: createdComment.id
          }
        }
      });

      return createdComment;
    });

    return {
      id: comment.id,
      taskId: comment.taskId,
      body: comment.body,
      authorName: comment.author.displayName,
      authorEmail: comment.author.email,
      createdAt: comment.createdAt.toISOString()
    };
  }

  private async updateTask(
    id: string,
    dto: Partial<{
      title: string;
      status: TaskStatus;
      priority: TaskPriority;
    }>,
    authorization?: string
  ) {
    const user = await this.authService.requireUserFromAuthorization(authorization);
    const [task, currentUser] = await Promise.all([
      this.prisma.task.findFirst({
        where: {
          id,
          project: {
            memberships: {
              some: {
                userId: user.id
              }
            }
          }
        }
      }),
      Promise.resolve(user)
    ]);

    if (!task) {
      throw new NotFoundException(`Task ${id} was not found`);
    }

    const updatedTask = await this.prisma.$transaction(async (tx) => {
      const nextTask = await tx.task.update({
        where: {
          id
        },
        data: {
          title: dto.title?.trim(),
          status: dto.status,
          priority: dto.priority
        },
        include: {
          assignee: {
            select: {
              displayName: true
            }
          }
        }
      });

      await tx.activityLog.create({
        data: {
          projectId: task.projectId,
          taskId: task.id,
          actorId: currentUser.id,
          action:
            dto.status && dto.status !== task.status
              ? ActivityAction.TASK_MOVED
              : ActivityAction.UPDATED,
          metadata:
            dto.status && dto.status !== task.status
              ? {
                  from: task.status,
                  to: dto.status
                }
              : {
                  entity: "task",
                  updatedFields: Object.keys(dto)
                }
        }
      });

      return nextTask;
    });

    return this.mapTaskSummary(updatedTask);
  }

  private mapTaskSummary(task: {
    id: string;
    projectId: string;
    boardId: string;
    title: string;
    status: TaskStatus;
    priority: TaskPriority;
    assignee?: { displayName: string } | null;
    dueDate?: Date | null;
  }) {
    return {
      id: task.id,
      projectId: task.projectId,
      boardId: task.boardId,
      title: task.title,
      status: task.status,
      priority: task.priority,
      assigneeName: task.assignee?.displayName,
      dueDate: task.dueDate?.toISOString()
    };
  }

  private async requireProjectMembership(projectId: string, userId: string) {
    const membership = await this.prisma.projectMember.findUnique({
      where: {
        projectId_userId: {
          projectId,
          userId
        }
      },
      select: {
        projectId: true
      }
    });

    if (!membership) {
      const projectExists = await this.prisma.project.findUnique({
        where: {
          id: projectId
        },
        select: {
          id: true
        }
      });

      if (!projectExists) {
        throw new NotFoundException(`Project ${projectId} was not found`);
      }

      throw new ForbiddenException(
        `You do not have access to project ${projectId}`
      );
    }
  }
}
