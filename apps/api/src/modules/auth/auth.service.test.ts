import { ConflictException, UnauthorizedException } from "@nestjs/common";
import { hash } from "bcryptjs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthService } from "./auth.service.js";

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

describe("AuthService", () => {
  beforeEach(() => {
    process.env.JWT_SECRET = "taskflow-test-access-secret";
    process.env.REFRESH_TOKEN_SECRET = "taskflow-test-refresh-secret";
  });

  it("registers a normalized user and stores a hashed refresh token", async () => {
    const prisma = createPrismaMock();
    const service = new AuthService(prisma as never);

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

    const session = await service.register({
      email: " Demo@Taskflow.local ",
      password: "taskflow123",
      displayName: " Demo User "
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
    expect(prisma.refreshToken.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "user-1",
          tokenHash: expect.any(String),
          expiresAt: expect.any(Date)
        })
      })
    );
    expect(session.user).toEqual({
      id: "user-1",
      email: "demo@taskflow.local",
      displayName: "Demo User"
    });
    expect(session.accessToken).toEqual(expect.any(String));
    expect(session.refreshToken).toEqual(expect.any(String));
  });

  it("rejects duplicate registrations", async () => {
    const prisma = createPrismaMock();
    const service = new AuthService(prisma as never);

    prisma.user.findUnique.mockResolvedValue({
      id: "user-1"
    });

    await expect(
      service.register({
        email: "demo@taskflow.local",
        password: "taskflow123",
        displayName: "Demo User"
      })
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it("rejects invalid passwords during login", async () => {
    const prisma = createPrismaMock();
    const service = new AuthService(prisma as never);

    prisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "demo@taskflow.local",
      displayName: "Demo User",
      passwordHash: await hash("different-password", 12)
    });

    await expect(
      service.login({
        email: "demo@taskflow.local",
        password: "taskflow123"
      })
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.refreshToken.create).not.toHaveBeenCalled();
  });
});
