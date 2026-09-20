# bullmq-prometheus

Prometheus metrics exporter for BullMQ

<p align="center">
  <img src="./media/splash.png" width="400" />
<p>

## Start

```bash
docker run -it -p 3000:3000 -e REDIS_HOST=host.docker.internal igrek8/bullmq-prometheus
```

## Environments

- `HOST` - HTTP server host (default: 0.0.0.0)
- `PORT` - HTTP server port (default: 3000)
- `PROM_PREFIX` - Prometheus metric prefix (default: bull)
- `BULL_PREFIX` - BullMQ prefix (default: bull)
- `REDIS_HOST` - Redis host (default: 127.0.0.1)
- `REDIS_PORT` - Redis port (default: 6379)
- `REDIS_PASSWORD` - Redis password
- `REDIS_DB` - Redis databases (comma separated list of colon separated tuples `index:alias`) (default: `0:default`)
  - For example `0:staging,1:sandbox`, the alias will be used as a label
- `REDIS_CA` - Redis CA certificate (base64 encoded CA certificate) (default: none)
  - For example `cat ca.crt | base64`
- `REDIS_TLS` - Redis TLS (default: false)
- `BULL_QUEUES` - Comma-separated list of queue names to monitor (default: not set)
  - For example: `myQueue1,myQueue2,myQueue3`
    Note: When set, the application will use these queue names directly without scanning Redis. This can significantly improve performance in environments with large Redis datasets by avoiding costly key scans. Since queue names typically do not change frequently, specifying them explicitly ensures minimal impact on performance during instrumentation.
- `REDIS_SENTINEL_ENABLED` - Redis sentinel mode enabled (default: false)
- `REDIS_SENTINEL_HOSTS` - Redis sentinel addresses in `host:port` format as comma separated string
- `REDIS_NAMESPACE` - Redis namespace (also referred as redis name)
- `REDIS_SENTINEL_PASSWORD` - Redis sentinel password
- `REDIS_SENTINEL_CA` - Redis sentinel CA certificate (base64 encoded CA certificate) (default: none)
- `REDIS_SENTINEL_TLS` - Redis sentinel TLS (default: false)

## Endpoints

- `/metrics` - Prometheus metrics
  - `HTTP 200` - Metrics per queue
    - `active_total` - Number of jobs in processing
    - `wait_total` - Number of pending jobs
    - `waiting_children_total` - Number of pending children jobs
    - `prioritized_total` - Number of prioritized jobs
    - `delayed_total` - Number of delayed jobs
    - `failed_total` - Number of failed jobs
    - `completed_total` - Number of completed jobs (last 1 minute)
- `/health` - Health endpoint
  - `HTTP 200` - Redis is available
  - `HTTP 503` - Redis is unavailable

## Example

```
# HELP bull_active_total Number of jobs in processing
# TYPE bull_active_total gauge
bull_active_total{queue="child","db"="default"} 0
bull_active_total{queue="parent","db"="default"} 0

# HELP bull_wait_total Number of pending jobs
# TYPE bull_wait_total gauge
bull_wait_total{queue="child","db"="default"} 0
bull_wait_total{queue="parent","db"="default"} 0

# HELP bull_waiting_children_total Number of pending children jobs
# TYPE bull_waiting_children_total gauge
bull_waiting_children_total{queue="child","db"="default"} 0
bull_waiting_children_total{queue="parent","db"="default"} 0

# HELP bull_prioritized_total Number of prioritized jobs
# TYPE bull_prioritized_total gauge
bull_prioritized_total{queue="child","db"="default"} 0
bull_prioritized_total{queue="parent","db"="default"} 0

# HELP bull_delayed_total Number of delayed jobs
# TYPE bull_delayed_total gauge
bull_delayed_total{queue="child","db"="default"} 0
bull_delayed_total{queue="parent","db"="default"} 0

# HELP bull_failed_total Number of failed jobs
# TYPE bull_failed_total gauge
bull_failed_total{queue="child","db"="default"} 0
bull_failed_total{queue="parent","db"="default"} 0

# HELP bull_completed_total Number of completed jobs
# TYPE bull_completed_total gauge
bull_completed_total{queue="child","db"="default"} 0
bull_completed_total{queue="parent","db"="default"} 0
```
