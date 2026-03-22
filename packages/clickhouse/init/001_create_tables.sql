-- Agent invocations (raw events from OTel spans)
CREATE TABLE IF NOT EXISTS agent_monitor.agent_invocations
(
    tenant_id       String,         -- org-{org_id}__ws-{workspace_id}
    timestamp       DateTime64(3),
    trace_id        String,
    span_id         String,
    agent_name      String,
    agent_version   String,
    status          Enum8('ok' = 0, 'error' = 1),
    duration_ms     Float64,
    step_count      UInt32,
    error_type      LowCardinality(String),
    error_message   String,
    model           LowCardinality(String),
    provider        LowCardinality(String),
    environment     LowCardinality(String)
)
ENGINE = MergeTree()
PARTITION BY (tenant_id, toYYYYMM(timestamp))
ORDER BY (tenant_id, agent_name, timestamp)
TTL toDateTime(timestamp) + INTERVAL 90 DAY;

-- Tool calls
CREATE TABLE IF NOT EXISTS agent_monitor.tool_calls
(
    tenant_id       String,
    timestamp       DateTime64(3),
    trace_id        String,
    span_id         String,
    agent_name      String,
    tool_name       LowCardinality(String),
    status          Enum8('ok' = 0, 'error' = 1),
    duration_ms     Float64,
    retry_count     UInt8,
    error_type      LowCardinality(String)
)
ENGINE = MergeTree()
PARTITION BY (tenant_id, toYYYYMM(timestamp))
ORDER BY (tenant_id, tool_name, timestamp)
TTL toDateTime(timestamp) + INTERVAL 90 DAY;

-- LLM token usage
CREATE TABLE IF NOT EXISTS agent_monitor.llm_token_usage
(
    tenant_id       String,
    timestamp       DateTime64(3),
    trace_id        String,
    agent_name      String,
    model           LowCardinality(String),
    provider        LowCardinality(String),
    input_tokens    UInt32,
    output_tokens   UInt32,
    total_tokens    UInt32,
    cost_usd        Float64,
    duration_ms     Float64
)
ENGINE = MergeTree()
PARTITION BY (tenant_id, toYYYYMM(timestamp))
ORDER BY (tenant_id, model, timestamp)
TTL toDateTime(timestamp) + INTERVAL 90 DAY;

-- Pre-aggregated 1-minute rollups for dashboard queries
CREATE TABLE IF NOT EXISTS agent_monitor.metrics_1m
(
    tenant_id       String,
    timestamp       DateTime,       -- floored to minute
    metric_name     LowCardinality(String),
    dimensions      Map(String, String),
    count           UInt64,
    sum             Float64,
    min             Float64,
    max             Float64,
    p50             Float64,
    p95             Float64,
    p99             Float64
)
ENGINE = SummingMergeTree()
PARTITION BY (tenant_id, toYYYYMM(timestamp))
ORDER BY (tenant_id, metric_name, timestamp)
TTL timestamp + INTERVAL 90 DAY;
