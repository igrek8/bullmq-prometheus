import { once } from "events";
import { Redis } from "ioredis";
import fastify from "fastify";

const HOST = process.env.HOST ?? "127.0.0.1";
const PORT = Number.parseInt(process.env.PORT ?? 3000);
const PROM_PREFIX = process.env.PROM_PREFIX ?? "bull";
const BULL_PREFIX = process.env.BULL_PREFIX ?? "bull";
const REDIS_HOST = process.env.REDIS_HOST ?? "127.0.0.1";
const REDIS_PORT = Number.parseInt(process.env.REDIST_PORT ?? 6379);
const REDIS_PASSWORD = process.env.REDIS_PASSWORD;
const SLIDING_WINDOW_SECONDS = process.env.SLIDING_WINDOW_SECONDS ?? 60;

const app = fastify({ logger: true });

const redis = new Redis({
  host: REDIS_HOST,
  port: REDIS_PORT,
  password: REDIS_PASSWORD,
  maxRetriesPerRequest: null,
  offlineQueue: false,
});

app.get("/health", (_, res) => {
  res.code(redis.status === "ready" ? 200 : 503).send();
});

app.get("/metrics", async (_, res) => {
  const now = new Date();
  const multi = redis.multi();
  const time = new Date(now);
  time.setSeconds(time.getSeconds() - SLIDING_WINDOW_SECONDS);

  const queues = [];
  let cursor = "0";

  do {
    const [next, elements] = await redis.scan(cursor, "MATCH", `${BULL_PREFIX}:*:meta`);
    queues.push(...elements);
    cursor = next;
  } while (cursor !== "0");

  queues.forEach((queue) => {
    const [, name] = queue.split(":");
    multi.llen(`${BULL_PREFIX}:${name}:active`);
    multi.llen(`${BULL_PREFIX}:${name}:wait`);
    multi.zcount(`${BULL_PREFIX}:${name}:waiting-children`, "-inf", "+inf");
    multi.zcount(`${BULL_PREFIX}:${name}:prioritized`, "-inf", "+inf");
    multi.zcount(`${BULL_PREFIX}:${name}:delayed`, "-inf", "+inf");
    multi.zcount(`${BULL_PREFIX}:${name}:failed`, "-inf", "+inf");
    multi.zcount(`${BULL_PREFIX}:${name}:completed`, +time, "+inf");
  });

  const results = await multi.exec();

  const offset = 7;

  const metrics = {
    [`${PROM_PREFIX}_active_total`]: {
      description: "Number of jobs in processing",
      queues: {},
    },
    [`${PROM_PREFIX}_wait_total`]: {
      description: "Number of pending jobs",
      queues: {},
    },
    [`${PROM_PREFIX}_waiting_children_total`]: {
      description: "Number of pending children jobs",
      queues: {},
    },
    [`${PROM_PREFIX}_prioritized_total`]: {
      description: "Number of prioritized jobs",
      queues: {},
    },
    [`${PROM_PREFIX}_delayed_total`]: {
      description: "Number of delayed jobs",
      queues: {},
    },
    [`${PROM_PREFIX}_failed_total`]: {
      description: "Number of failed jobs",
      queues: {},
    },
    [`${PROM_PREFIX}_last_${SLIDING_WINDOW_SECONDS}_seconds_completed_total`]: {
      description: `Number of last ${SLIDING_WINDOW_SECONDS} seconds completed jobs`,
      queues: {},
    },
  };

  for (let i = 0; i < results.length / offset; i++) {
    const [, queue] = queues[i].split(":");

    const [
      [, active_total],
      [, wait_total],
      [, waiting_children_total],
      [, prioritized_total],
      [, delayed_total],
      [, failed_total],
      [, completed_total],
    ] = results.slice(i * offset, (i + 1) * offset);

    const data = {
      [`${PROM_PREFIX}_active_total`]: active_total,
      [`${PROM_PREFIX}_wait_total`]: wait_total,
      [`${PROM_PREFIX}_waiting_children_total`]: waiting_children_total,
      [`${PROM_PREFIX}_prioritized_total`]: prioritized_total,
      [`${PROM_PREFIX}_delayed_total`]: delayed_total,
      [`${PROM_PREFIX}_failed_total`]: failed_total,
      [`${PROM_PREFIX}_last_${SLIDING_WINDOW_SECONDS}_seconds_completed_total`]: completed_total,
    };

    for (const metric in data) {
      const value = data[metric];
      metrics[metric].queues[queue] = value;
    }
  }

  let output = "";

  for (const metric in metrics) {
    const { queues, description } = metrics[metric];
    let hasData = false;
    for (const queue in queues) {
      if (!hasData) {
        output += `# HELP ${metric} ${description}\n`;
        output += `# TYPE ${metric} gauge\n`;
        hasData = true;
      }
      const value = queues[queue];
      output += `${metric}{queue="${queue}"} ${value}\n`;
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
