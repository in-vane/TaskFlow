import { hash } from "bcryptjs";
import { PrismaClient, Role } from "@prisma/client";

const prisma = new PrismaClient();
const DEMO_PASSWORD = "taskflow123";

async function main() {
  const demoPasswordHash = await hash(DEMO_PASSWORD, 12);
  const user = await prisma.user.upsert({
    where: {
      email: "demo@taskflow.local"
    },
    update: {
      displayName: "Demo User",
      passwordHash: demoPasswordHash
    },
    create: {
      email: "demo@taskflow.local",
      passwordHash: demoPasswordHash,
      displayName: "Demo User"
    }
  });

  const project = await prisma.project.upsert({
    where: {
      key: "APP"
    },
    update: {},
    create: {
      key: "APP",
      name: "TaskFlow Web",
      ownerId: user.id
    }
  });

  const boards = await Promise.all(
    [
      { name: "Backlog", position: 1 },
      { name: "In Progress", position: 2 },
      { name: "Done", position: 3 }
    ].map(({ name, position }) =>
      prisma.board.upsert({
        where: {
          projectId_position: {
            projectId: project.id,
            position
          }
        },
        update: {
          name
        },
        create: {
          projectId: project.id,
          name,
          position
        }
      })
    )
  );

  await prisma.projectMember.upsert({
    where: {
      projectId_userId: {
        projectId: project.id,
        userId: user.id
      }
    },
    update: {},
    create: {
      projectId: project.id,
      userId: user.id,
      role: Role.OWNER
    }
  });

  const task = await prisma.task.upsert({
    where: {
      id: "seed-task-app-ci"
    },
    update: {
      title: "Design CI pipeline",
      status: "IN_PROGRESS",
      priority: "HIGH",
      boardId: boards[1].id,
      assigneeId: user.id,
      description: "Wire branch validation, smoke tests, and staged deployments."
    },
    create: {
      id: "seed-task-app-ci",
      projectId: project.id,
      boardId: boards[1].id,
      title: "Design CI pipeline",
      description:
        "Wire branch validation, smoke tests, and staged deployments.",
      status: "IN_PROGRESS",
      priority: "HIGH",
      assigneeId: user.id
    }
  });

  await prisma.taskComment.upsert({
    where: {
      id: "seed-comment-ci"
    },
    update: {
      body: "Remember to keep Compose project names isolated in CI."
    },
    create: {
      id: "seed-comment-ci",
      taskId: task.id,
      authorId: user.id,
      body: "Remember to keep Compose project names isolated in CI."
    }
  });

  await prisma.activityLog.upsert({
    where: {
      id: "seed-activity-project-created"
    },
    update: {},
    create: {
      id: "seed-activity-project-created",
      projectId: project.id,
      actorId: user.id,
      action: "CREATED",
      metadata: {
        entity: "project",
        key: project.key
      }
    }
  });

  await prisma.activityLog.upsert({
    where: {
      id: "seed-activity-task-moved"
    },
    update: {
      taskId: task.id,
      metadata: {
        from: "TODO",
        to: "IN_PROGRESS"
      }
    },
    create: {
      id: "seed-activity-task-moved",
      projectId: project.id,
      taskId: task.id,
      actorId: user.id,
      action: "TASK_MOVED",
      metadata: {
        from: "TODO",
        to: "IN_PROGRESS"
      }
    }
  });

  console.log(
    `Seeded demo user, project, boards, task, comment, and activity. Demo login: demo@taskflow.local / ${DEMO_PASSWORD}`
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
