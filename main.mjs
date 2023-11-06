import { once } from "events";
import { Redis } from "ioredis";
import fastify from "fastify";
import bullmq from "bullmq";

const HOST = process.env.HOST ?? "0.0.0.0";
const PORT = Number.parseInt(process.env.PORT ?? 3000);
const PROM_PREFIX = process.env.PROM_PREFIX ?? "bull";
const BULL_PREFIX = process.env.BULL_PREFIX ?? "bull";
const REDIS_HOST = process.env.REDIS_HOST ?? "127.0.0.1";
const REDIS_PORT = Number.parseInt(process.env.REDIST_PORT ?? 6379);
const REDIS_DB = process.env.REDIS_DB ?? "0:default";
const REDIS_USERNAME = process.env.REDIS_USERNAME;
const REDIS_PASSWORD = process.env.REDIS_PASSWORD;

const app = fastify({ logger: true });

const databases = REDIS_DB.split(",").map((val) => val.split(":"));

const descriptions = {
  [`${PROM_PREFIX}_active_total`]: "Number of jobs in processing",
  [`${PROM_PREFIX}_wait_total`]: "Number of pending jobs",
  [`${PROM_PREFIX}_waiting_children_total`]: "Number of pending children jobs",
  [`${PROM_PREFIX}_prioritized_total`]: "Number of prioritized jobs",
  [`${PROM_PREFIX}_delayed_total`]: "Number of delayed jobs",
  [`${PROM_PREFIX}_failed_total`]: "Number of failed jobs",
  [`${PROM_PREFIX}_completed_total`]: "Number of completed jobs",
  [`${PROM_PREFIX}_wait_max_age_sec`]: "Max age of pending jobs",
  [`${PROM_PREFIX}_active_max_age_sec`]: "Max age of processing jobs",
};

const redis = new Redis({
  host: REDIS_HOST,
  port: REDIS_PORT,
  username: REDIS_USERNAME,
  password: REDIS_PASSWORD,
  maxRetriesPerRequest: null,
  offlineQueue: false,
});

app.get("/health", (_, res) => {
  res.code(redis.status === "ready" ? 200 : 503).send();
});

app.get("/metrics", async (_, res) => {
  const metrics = {};

  for (const [index, db] of databases) {
    await redis.select(index);

    let cursor = "0";
    const queues = [];

    do {
      const [next, elements] = await redis.scan(cursor, "MATCH", `${BULL_PREFIX}:*:meta`);
      queues.push(...elements);
      cursor = next;
    } while (cursor !== "0");

    const multi = redis.multi();

    queues.forEach((queue) => {
      const [, name] = queue.split(":");
      multi.llen(`${BULL_PREFIX}:${name}:active`);
      multi.llen(`${BULL_PREFIX}:${name}:wait`);
      multi.zcard(`${BULL_PREFIX}:${name}:waiting-children`);
      multi.zcard(`${BULL_PREFIX}:${name}:prioritized`);
      multi.zcard(`${BULL_PREFIX}:${name}:delayed`);
      multi.zcard(`${BULL_PREFIX}:${name}:failed`);
      multi.zcard(`${BULL_PREFIX}:${name}:completed`);
    });

    const results = await multi.exec();

    const offset = 7;

    for (let i = 0; i < results.length / offset; i++) {
      const queue = queues[i].split(":").slice(1, -1).join(":");

      const [
        [, active_total],
        [, wait_total],
        [, waiting_children_total],
        [, prioritized_total],
        [, delayed_total],
        [, failed_total],
        [, completed_total],
      ] = results.slice(i * offset, (i + 1) * offset);

      const bullQueue = new bullmq.Queue(queue, { connection: redis, prefix: BULL_PREFIX });

      const wait_max_age_sec = await bullQueue
        .getWaiting()
        .then((jobs) =>
          jobs.map((job) => (new Date().getTime() - job.timestamp) / 1000).reduce((a, b) => Math.max(a, b), 0)
        );

      const active_max_age_sec = await bullQueue
        .getActive()
        .then((jobs) =>
          jobs.map((job) => (new Date().getTime() - job.timestamp) / 1000).reduce((a, b) => Math.max(a, b), 0)
        );

      await bullQueue.disconnect();

      const data = {
        [`${PROM_PREFIX}_active_total`]: active_total,
        [`${PROM_PREFIX}_wait_total`]: wait_total,
        [`${PROM_PREFIX}_waiting_children_total`]: waiting_children_total,
        [`${PROM_PREFIX}_prioritized_total`]: prioritized_total,
        [`${PROM_PREFIX}_delayed_total`]: delayed_total,
        [`${PROM_PREFIX}_failed_total`]: failed_total,
        [`${PROM_PREFIX}_completed_total`]: completed_total,
        [`${PROM_PREFIX}_wait_max_age_sec`]: wait_max_age_sec,
        [`${PROM_PREFIX}_active_max_age_sec`]: active_max_age_sec,
      };

      for (const metric in data) {
        const value = data[metric];
        metrics[metric] ??= {};
        metrics[metric][db] ??= {};
        metrics[metric][db][queue] ??= value;
      }
    }
  }

  let output = "";

  for (const metric in metrics) {
    let hasData = false;
    for (const db in metrics[metric]) {
      for (const queue in metrics[metric][db]) {
        if (!hasData) {
          output += `# HELP ${metric} ${descriptions[metric]}\n`;
          output += `# TYPE ${metric} gauge\n`;
          hasData = true;
        }
        const value = metrics[metric][db][queue];
        output += `${metric}{queue="${queue}",db="${db}"} ${value}\n`;
      }
    }
    output += "\n";
  }

  res.code(200).header("Content-Type", "text/plain").send(output);
});

process.on("SIGINT", async () => {
  await app.close();
  redis.disconnect(false);
});

await once(redis, "ready");
await app.listen({ host: HOST, port: PORT });
