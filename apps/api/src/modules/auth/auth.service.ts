import {
  ConflictException,
  Injectable,
  UnauthorizedException
} from "@nestjs/common";
import { hash, compare } from "bcryptjs";
import { createHash, randomUUID } from "node:crypto";
import { SignJWT, jwtVerify, errors as joseErrors } from "jose";
import { PrismaService } from "../../prisma/prisma.service.js";

const ACCESS_TOKEN_TTL = "15m";
const REFRESH_TOKEN_TTL = "7d";

interface AuthTokenPayload {
  sub: string;
  email: string;
  displayName: string;
  type: "access" | "refresh";
}

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async register(dto: {
    email: string;
    password: string;
    displayName: string;
  }) {
    const email = dto.email.trim().toLowerCase();
    const displayName = dto.displayName.trim();

    const existingUser = await this.prisma.user.findUnique({
      where: {
        email
      }
    });

    if (existingUser) {
      throw new ConflictException(`A user with email ${email} already exists`);
    }

    const passwordHash = await hash(dto.password, 12);
    const user = await this.prisma.user.create({
      data: {
        email,
        displayName,
        passwordHash
      }
    });

    return this.issueSession(user);
  }

  async login(dto: { email: string; password: string }) {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: {
        email
      }
    });

    if (!user) {
      throw new UnauthorizedException("Invalid email or password");
    }

    const passwordMatches = await compare(dto.password, user.passwordHash);

    if (!passwordMatches) {
      throw new UnauthorizedException("Invalid email or password");
    }

    return this.issueSession(user);
  }

  async refresh(refreshToken: string) {
    const payload = await this.verifyToken(refreshToken, "refresh");
    const hashedToken = this.hashToken(refreshToken);
    const now = new Date();

    const storedToken = await this.prisma.refreshToken.findFirst({
      where: {
        tokenHash: hashedToken,
        userId: payload.sub,
        revokedAt: null,
        expiresAt: {
          gt: now
        }
      }
    });

    if (!storedToken) {
      throw new UnauthorizedException("Refresh token is invalid or expired");
    }

    await this.prisma.refreshToken.update({
      where: {
        id: storedToken.id
      },
      data: {
        revokedAt: now
      }
    });

    const user = await this.prisma.user.findUnique({
      where: {
        id: payload.sub
      }
    });

    if (!user) {
      throw new UnauthorizedException("User account no longer exists");
    }

    return this.issueSession(user);
  }

  async logout(refreshToken: string) {
    const hashedToken = this.hashToken(refreshToken);

    await this.prisma.refreshToken.updateMany({
      where: {
        tokenHash: hashedToken,
        revokedAt: null
      },
      data: {
        revokedAt: new Date()
      }
    });

    return {
      success: true
    };
  }

  async me(authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    const payload = await this.verifyToken(accessToken, "access");
    const user = await this.prisma.user.findUnique({
      where: {
        id: payload.sub
      },
      include: {
        memberships: {
          include: {
            project: {
              select: {
                id: true,
                key: true,
                name: true
              }
            }
          }
        }
      }
    });

    if (!user) {
      throw new UnauthorizedException("User account no longer exists");
    }

    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
      projects: user.memberships.map((membership) => ({
        id: membership.project.id,
        key: membership.project.key,
        name: membership.project.name,
        role: membership.role
      }))
    };
  }

  async requireUserFromAuthorization(authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    const payload = await this.verifyToken(accessToken, "access");
    const user = await this.prisma.user.findUnique({
      where: {
        id: payload.sub
      }
    });

    if (!user) {
      throw new UnauthorizedException("User account no longer exists");
    }

    return user;
  }

  private async issueSession(user: {
    id: string;
    email: string;
    displayName: string;
  }) {
    const accessToken = await this.signToken(user, "access", ACCESS_TOKEN_TTL);
    const refreshToken = await this.signToken(user, "refresh", REFRESH_TOKEN_TTL);
    const refreshPayload = await this.verifyToken(refreshToken, "refresh");

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hashToken(refreshToken),
        expiresAt: new Date((refreshPayload.exp ?? 0) * 1000)
      }
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName
      }
    };
  }

  private async signToken(
    user: {
      id: string;
      email: string;
      displayName: string;
    },
    type: AuthTokenPayload["type"],
    expiresIn: string
  ) {
    return new SignJWT({
      email: user.email,
      displayName: user.displayName,
      type
    })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(user.id)
      .setJti(randomUUID())
      .setIssuedAt()
      .setExpirationTime(expiresIn)
      .sign(type === "access" ? this.accessSecret : this.refreshSecret);
  }

  private async verifyToken(
    token: string,
    expectedType: AuthTokenPayload["type"]
  ) {
    try {
      const { payload } = await jwtVerify(token, this.secretForType(expectedType));

      if (payload.type !== expectedType || typeof payload.sub !== "string") {
        throw new UnauthorizedException("Token payload is invalid");
      }

      return {
        sub: payload.sub,
        email: String(payload.email ?? ""),
        displayName: String(payload.displayName ?? ""),
        type: payload.type as AuthTokenPayload["type"],
        exp: payload.exp
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      if (
        error instanceof joseErrors.JWTExpired ||
        error instanceof joseErrors.JOSEError
      ) {
        throw new UnauthorizedException("Token is invalid or expired");
      }

      throw error;
    }
  }

  private extractBearerToken(authorization?: string) {
    if (!authorization?.startsWith("Bearer ")) {
      throw new UnauthorizedException("Missing Bearer token");
    }

    return authorization.slice("Bearer ".length).trim();
  }

  private hashToken(token: string) {
    return createHash("sha256").update(token).digest("hex");
  }

  private secretForType(type: AuthTokenPayload["type"]) {
    return type === "access" ? this.accessSecret : this.refreshSecret;
  }

  private get accessSecret() {
    return new TextEncoder().encode(
      process.env.JWT_SECRET ?? "taskflow-dev-secret"
    );
  }

  private get refreshSecret() {
    return new TextEncoder().encode(
      process.env.REFRESH_TOKEN_SECRET ?? "taskflow-dev-refresh-secret"
    );
  }
}
