import {
  ForbiddenException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { ActivityAction, Role } from "@prisma/client";
import type { ProjectSummary } from "@taskflow/shared-types";
import { AuthService } from "../auth/auth.service.js";
import { PrismaService } from "../../prisma/prisma.service.js";

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService
  ) {}

  async findAll(authorization?: string): Promise<ProjectSummary[]> {
    const user = await this.authService.requireUserFromAuthorization(authorization);
    const memberships = await this.prisma.projectMember.findMany({
      where: {
        userId: user.id
      },
      include: {
        project: {
          include: {
            _count: {
              select: {
                boards: true,
                tasks: true
              }
            }
          }
        }
      },
      orderBy: {
        createdAt: "asc"
      }
    });

    return memberships.map((membership) => ({
      id: membership.project.id,
      key: membership.project.key,
      name: membership.project.name,
      role: membership.role,
      boardCount: membership.project._count.boards,
      taskCount: membership.project._count.tasks
    }));
  }

  async findOne(id: string, authorization?: string) {
    const user = await this.authService.requireUserFromAuthorization(authorization);
    const membership = await this.requireProjectMembership(id, user.id);
    const project = membership.project;

    return {
      id: project.id,
      key: project.key,
      name: project.name,
      owner: project.owner,
      role: membership.role,
      boardCount: project._count.boards,
      taskCount: project._count.tasks,
      activityCount: project._count.activities,
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString()
    };
  }

  async findBoards(projectId: string, authorization?: string) {
    const user = await this.authService.requireUserFromAuthorization(authorization);
    await this.requireProjectMembership(projectId, user.id);

    const boards = await this.prisma.board.findMany({
      where: {
        projectId
      },
      include: {
        _count: {
          select: {
            tasks: true
          }
        }
      },
      orderBy: {
        position: "asc"
      }
    });

    return boards.map((board) => ({
      id: board.id,
      projectId: board.projectId,
      name: board.name,
      position: board.position,
      taskCount: board._count.tasks,
      createdAt: board.createdAt.toISOString(),
      updatedAt: board.updatedAt.toISOString()
    }));
  }

  async findActivity(projectId: string, authorization?: string) {
    const user = await this.authService.requireUserFromAuthorization(authorization);
    await this.requireProjectMembership(projectId, user.id);

    const activities = await this.prisma.activityLog.findMany({
      where: {
        projectId
      },
      include: {
        actor: {
          select: {
            id: true,
            displayName: true,
            email: true
          }
        },
        task: {
          select: {
            id: true,
            title: true
          }
        }
      },
      orderBy: {
        createdAt: "desc"
      }
    });

    return activities.map((activity) => ({
      id: activity.id,
      projectId: activity.projectId,
      taskId: activity.taskId,
      action: activity.action,
      actorName: activity.actor?.displayName ?? "System",
      actorEmail: activity.actor?.email,
      taskTitle: activity.task?.title,
      metadata: activity.metadata,
      createdAt: activity.createdAt.toISOString()
    }));
  }

  async create(dto: { name: string; key: string }, authorization?: string) {
    const user = await this.authService.requireUserFromAuthorization(authorization);
    const normalizedKey = dto.key.trim().toUpperCase();

    const project = await this.prisma.$transaction(async (tx) => {
      const createdProject = await tx.project.create({
        data: {
          key: normalizedKey,
          name: dto.name.trim(),
          ownerId: user.id
        }
      });

      await tx.projectMember.create({
        data: {
          projectId: createdProject.id,
          userId: user.id,
          role: Role.OWNER
        }
      });

      await tx.board.createMany({
        data: [
          {
            projectId: createdProject.id,
            name: "Backlog",
            position: 1
          },
          {
            projectId: createdProject.id,
            name: "In Progress",
            position: 2
          },
          {
            projectId: createdProject.id,
            name: "Done",
            position: 3
          }
        ]
      });

      await tx.activityLog.create({
        data: {
          projectId: createdProject.id,
          actorId: user.id,
          action: ActivityAction.CREATED,
          metadata: {
            entity: "project",
            key: normalizedKey,
            name: dto.name.trim()
          }
        }
      });

      return tx.project.findUniqueOrThrow({
        where: {
          id: createdProject.id
        },
        include: {
          _count: {
            select: {
              boards: true,
              tasks: true
            }
          }
        }
      });
    });

    return {
      id: project.id,
      key: project.key,
      name: project.name,
      role: Role.OWNER,
      boardCount: project._count.boards,
      taskCount: project._count.tasks
    } satisfies ProjectSummary;
  }

  async createBoard(
    projectId: string,
    body: { name: string },
    authorization?: string
  ) {
    const user = await this.authService.requireUserFromAuthorization(authorization);
    const [membership, lastBoard] = await Promise.all([
      this.requireProjectMembership(projectId, user.id),
      this.prisma.board.findFirst({
        where: {
          projectId
        },
        orderBy: {
          position: "desc"
        }
      })
    ]);
    const project = membership.project;

    const board = await this.prisma.$transaction(async (tx) => {
      const createdBoard = await tx.board.create({
        data: {
          projectId: project.id,
          name: body.name.trim(),
          position: (lastBoard?.position ?? 0) + 1
        }
      });

      await tx.activityLog.create({
        data: {
          projectId: project.id,
          actorId: user.id,
          action: ActivityAction.CREATED,
          metadata: {
            entity: "board",
            boardId: createdBoard.id,
            name: createdBoard.name
          }
        }
      });

      return createdBoard;
    });

    return {
      id: board.id,
      projectId: board.projectId,
      name: board.name,
      position: board.position,
      createdAt: board.createdAt.toISOString(),
      updatedAt: board.updatedAt.toISOString()
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
      include: {
        project: {
          include: {
            owner: {
              select: {
                id: true,
                email: true,
                displayName: true
              }
            },
            _count: {
              select: {
                boards: true,
                tasks: true,
                activities: true
              }
            }
          }
        }
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

    return membership;
  }
}
