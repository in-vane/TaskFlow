import { Injectable } from "@nestjs/common";
import { Redis } from "ioredis";
import type { HealthPayload } from "@taskflow/shared-types";
import { PrismaService } from "../../prisma/prisma.service.js";

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  live(): HealthPayload {
    return {
      status: "ok",
      timestamp: new Date().toISOString()
    };
  }

  async ready(): Promise<HealthPayload> {
    const redis = new Redis(process.env.REDIS_URL ?? "redis://redis:6379", {
      lazyConnect: true,
      maxRetriesPerRequest: 1
    });

    let databaseStatus: "up" | "down" = "up";
    let redisStatus: "up" | "down" = "up";

    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      databaseStatus = "down";
    }

    try {
      await redis.connect();
      await redis.ping();
    } catch {
      redisStatus = "down";
    } finally {
      redis.disconnect();
    }

    return {
      status: databaseStatus === "up" && redisStatus === "up" ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
      services: {
        database: databaseStatus,
        redis: redisStatus
      }
    };
  }
}
