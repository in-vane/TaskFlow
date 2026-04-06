import { QueueEvents, Worker } from "bullmq";
import { Redis } from "ioredis";

const redisUrl = process.env.REDIS_URL ?? "redis://redis:6379";
const connection = new Redis(redisUrl, {
  maxRetriesPerRequest: null
});

const queueName = process.env.NOTIFICATIONS_QUEUE ?? "notifications";

const worker = new Worker(
  queueName,
  async (job) => {
    console.log(`[worker] processing ${job.name}`, job.data);
    return {
      deliveredAt: new Date().toISOString()
    };
  },
  {
    connection
  }
);

const events = new QueueEvents(queueName, {
  connection
});

events.on("completed", ({ jobId }) => {
  console.log(`[worker] completed job ${jobId}`);
});

worker.on("failed", (job, error) => {
  console.error(`[worker] job ${job?.id} failed`, error);
});

console.log(`[worker] listening on ${queueName} with ${redisUrl}`);

process.on("SIGTERM", async () => {
  await worker.close();
  await events.close();
  connection.disconnect();
  process.exit(0);
});
