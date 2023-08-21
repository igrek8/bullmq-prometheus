# bullmq-prometheus

Prometheus metrics exporter for BullMQ

<p align="center">
  <img src="./media/splash.png" width="400" />
<p>

## Start

```bash
docker run -it -p 3000 igrek8/bullmq-prometheus -e HOST=0.0.0.0 -e REDIS_HOST=host.docker.internal
```

## Environments

- `HOST` - HTTP server host (default: 127.0.0.1)
- `PORT` - HTTP server port (default: 3000)
- `PROM_PREFIX` - Prometheus metric prefix (default: bull)
- `BULL_PREFIX` - BullMQ prefix (default: bull)
- `REDIS_HOST` - Redis host (default: 127.0.0.1)
- `REDIS_PORT` - Redis port (default: 6379)
- `SLIDING_WINDOW_SECONDS` - Last X seconds to count completed jobs (default: 60)

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
bull_active_total{queue="child"} 0
bull_active_total{queue="parent"} 0

# HELP bull_wait_total Number of pending jobs
# TYPE bull_wait_total gauge
bull_wait_total{queue="child"} 0
bull_wait_total{queue="parent"} 0

# HELP bull_waiting_children_total Number of pending children jobs
# TYPE bull_waiting_children_total gauge
bull_waiting_children_total{queue="child"} 0
bull_waiting_children_total{queue="parent"} 0

# HELP bull_prioritized_total Number of prioritized jobs
# TYPE bull_prioritized_total gauge
bull_prioritized_total{queue="child"} 0
bull_prioritized_total{queue="parent"} 0

# HELP bull_delayed_total Number of delayed jobs
# TYPE bull_delayed_total gauge
bull_delayed_total{queue="child"} 0
bull_delayed_total{queue="parent"} 0

# HELP bull_failed_total Number of failed jobs
# TYPE bull_failed_total gauge
bull_failed_total{queue="child"} 0
bull_failed_total{queue="parent"} 0

# HELP bull_completed_total Number of completed jobs
# TYPE bull_completed_total gauge
bull_completed_total{queue="child"} 0
bull_completed_total{queue="parent"} 0
```
