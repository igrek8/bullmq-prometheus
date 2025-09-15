import { once } from "events";
import fastify from "fastify";
import { Redis } from "ioredis";

const HOST = process.env.HOST ?? "0.0.0.0";
const PORT = Number.parseInt(process.env.PORT ?? 3000);
const PROM_PREFIX = process.env.PROM_PREFIX ?? "bull";
const BULL_PREFIX = process.env.BULL_PREFIX ?? "bull";
const BULL_QUEUES = process.env.BULL_QUEUES?.split(",");
const REDIS_HOST = process.env.REDIS_HOST ?? "127.0.0.1";
const REDIS_PORT = Number.parseInt(process.env.REDIS_PORT ?? 6379);
const REDIS_DB = process.env.REDIS_DB ?? "0:default";
const REDIS_USERNAME = process.env.REDIS_USERNAME;
const REDIS_PASSWORD = process.env.REDIS_PASSWORD;
const REDIS_CA = process.env.REDIS_CA;
const REDIS_TLS = process.env.REDIS_TLS === "true";

const REDIS_SENTINEL_ENABLED = process.env.REDIS_SENTINEL_ENABLED === "true";
const REDIS_SENTINEL_HOSTS = process.env.REDIS_SENTINEL_HOSTS;
const REDIS_NAMESPACE = process.env.REDIS_NAMESPACE;
const REDIS_SENTINEL_PASSWORD = process.env.REDIS_SENTINEL_PASSWORD;
const REDIS_SENTINEL_CA = process.env.REDIS_SENTINEL_CA;
const REDIS_SENTINEL_TLS = process.env.REDIS_SENTINEL_TLS === "true";

const app = fastify({ logger: true });

const databases = REDIS_DB.split(",").map((val) => val.split(":"));

const descriptions = {
  [`${PROM_PREFIX}_active_total`]: "Number of jobs in processing",
  [`${PROM_PREFIX}_wait_total`]: "Number of pending jobs",
  [`${PROM_PREFIX}_waiting_children_total`]: "Number of pending children jobs",
  [`${PROM_PREFIX}_prioritized_total`]: "Number of prioritized jobs",
  [`${PROM_PREFIX}_delayed_total`]: "Number of delayed jobs",
  [`${PROM_PREFIX}_failed_total`]: "Number of failed jobs",
  [`${PROM_PREFIX}_completed_total`]: "Number of completed jobs"
};

/**
 * @see https://github.com/redis/ioredis#tls-options
 */
const redis = getRedisDriverInstance();

app.get("/health", (_, res) => {
  res.code(redis.status === "ready" ? 200 : 503).send();
});

app.get("/metrics", async (_, res) => {
  const metrics = {};

  for (const [index, db] of databases) {
    await redis.select(index);

    const queues = [];

    if (BULL_QUEUES) {
      BULL_QUEUES.forEach((name) => {
        queues.push(`${BULL_PREFIX}:${name}:meta`);
      });
    } else {
      let cursor = "0";
      do {
        const [next, elements] = await redis.scan(cursor, "MATCH", `${BULL_PREFIX}:*:meta`);
        queues.push(...elements);
        cursor = next;
      } while (cursor !== "0");
    }

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

      const data = {
        [`${PROM_PREFIX}_active_total`]: active_total,
        [`${PROM_PREFIX}_wait_total`]: wait_total,
        [`${PROM_PREFIX}_waiting_children_total`]: waiting_children_total,
        [`${PROM_PREFIX}_prioritized_total`]: prioritized_total,
        [`${PROM_PREFIX}_delayed_total`]: delayed_total,
        [`${PROM_PREFIX}_failed_total`]: failed_total,
        [`${PROM_PREFIX}_completed_total`]: completed_total,
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

function getRedisDriverInstance() {
  let tls = getTlsSettings(REDIS_TLS, REDIS_CA);
  if (REDIS_SENTINEL_ENABLED) {
    const sentinels = REDIS_SENTINEL_HOSTS.split(",").map((entry) => {
      const [host, port] = entry.trim().split(":");
      return { host, port: parseInt(port, 10) };
    });
    let sentinelTLS = getTlsSettings(REDIS_SENTINEL_TLS, REDIS_SENTINEL_CA);
    return new Redis({
      sentinels: sentinels,
      name: REDIS_NAMESPACE,
      username: REDIS_USERNAME,
      password: REDIS_PASSWORD,
      maxRetriesPerRequest: null,
      offlineQueue: false,
      sentinelPassword: REDIS_SENTINEL_PASSWORD,
      tls,
      sentinelTLS
    });
  }
  return new Redis({
    host: REDIS_HOST,
    port: REDIS_PORT,
    username: REDIS_USERNAME,
    password: REDIS_PASSWORD,
    maxRetriesPerRequest: null,
    offlineQueue: false,
    tls
  });
}

function getTlsSettings(isTlsEnabled, certificate) {
  let tls = undefined;
  if (isTlsEnabled) {
    tls = {};
  } else if (certificate) {
    tls = {
      cert: Buffer.from(certificate, "base64"),
      rejectUnauthorized: true
    };
  }
  return tls;
}
