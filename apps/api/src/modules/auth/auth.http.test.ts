import type { INestApplication } from "@nestjs/common";
import {
  AuthController,
  LoginDto,
  RefreshTokenDto,
  RegisterDto
} from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { PrismaService } from "../../prisma/prisma.service.js";
import { createTestApp, createTestingModule } from "../../test/create-test-app.js";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function createPrismaMock() {
  return {
    user: {
      findUnique: vi.fn(),
      create: vi.fn()
    },
    refreshToken: {
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn()
    }
  };
}

Reflect.defineMetadata("design:paramtypes", [AuthService], AuthController);
Reflect.defineMetadata("design:paramtypes", [PrismaService], AuthService);
Reflect.defineMetadata(
  "design:paramtypes",
  [RegisterDto],
  AuthController.prototype,
  "register"
);
Reflect.defineMetadata(
  "design:paramtypes",
  [LoginDto],
  AuthController.prototype,
  "login"
);
Reflect.defineMetadata(
  "design:paramtypes",
  [RefreshTokenDto],
  AuthController.prototype,
  "refresh"
);
Reflect.defineMetadata(
  "design:paramtypes",
  [RefreshTokenDto],
  AuthController.prototype,
  "logout"
);
Reflect.defineMetadata(
  "design:paramtypes",
  [String],
  AuthController.prototype,
  "me"
);

describe("Auth HTTP", () => {
  let app: INestApplication | null = null;

  beforeEach(() => {
    process.env.JWT_SECRET = "taskflow-test-access-secret";
    process.env.REFRESH_TOKEN_SECRET = "taskflow-test-refresh-secret";
  });

  afterEach(async () => {
    await app?.close();
    app = null;
  });

  it("rejects invalid registration payloads with HTTP 400", async () => {
    const prisma = createPrismaMock();

    app = await createTestApp(() =>
      createTestingModule({
        controllers: [AuthController],
        providers: [
          AuthService,
          {
            provide: PrismaService,
            useValue: prisma
          }
        ]
      }).compile()
    );

    const response = await request(app.getHttpServer())
      .post("/api/auth/register")
      .send({
        email: "invalid-email",
        password: "short",
        displayName: "D"
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toEqual(
      expect.arrayContaining([
        "email must be an email",
        "password must be longer than or equal to 8 characters",
        "displayName must be longer than or equal to 2 characters"
      ])
    );
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("registers through the HTTP layer and returns a session payload", async () => {
    const prisma = createPrismaMock();

    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockImplementation(async ({ data }) => ({
      id: "user-1",
      email: data.email,
      displayName: data.displayName,
      passwordHash: data.passwordHash
    }));
    prisma.refreshToken.create.mockResolvedValue({
      id: "refresh-1"
    });

    app = await createTestApp(() =>
      createTestingModule({
        controllers: [AuthController],
        providers: [
          AuthService,
          {
            provide: PrismaService,
            useValue: prisma
          }
        ]
      }).compile()
    );

    const response = await request(app.getHttpServer())
      .post("/api/auth/register")
      .send({
        email: "Demo@Taskflow.local",
        password: "taskflow123",
        displayName: " Demo User "
      });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      accessToken: expect.any(String),
      refreshToken: expect.any(String),
      user: {
        id: "user-1",
        email: "demo@taskflow.local",
        displayName: "Demo User"
      }
    });
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: "demo@taskflow.local",
          displayName: "Demo User",
          passwordHash: expect.any(String)
        })
      })
    );
  });

  it("returns HTTP 401 when requesting /api/me without a bearer token", async () => {
    const prisma = createPrismaMock();

    app = await createTestApp(() =>
      createTestingModule({
        controllers: [AuthController],
        providers: [
          AuthService,
          {
            provide: PrismaService,
            useValue: prisma
          }
        ]
      }).compile()
    );

    const response = await request(app.getHttpServer()).get("/api/me");

    expect(response.status).toBe(401);
    expect(response.body.message).toBe("Missing Bearer token");
  });
});
