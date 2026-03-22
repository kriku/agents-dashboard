-- =============================================================================
-- Pre-aggregation materialized views — AggregatingMergeTree
-- =============================================================================
-- Replaces the old metrics_1m SummingMergeTree which could not store quantile
-- state (p50/p95/p99). AggregatingMergeTree with quantileState() correctly
-- supports mergeable quantile computation across time windows.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. hourly_agent_stats — pre-aggregated agent metrics per hour
-- -----------------------------------------------------------------------------
-- Supports: active_agents, invocation_rate, error_rate, p95_latency panels
CREATE TABLE IF NOT EXISTS agent_monitor.hourly_agent_stats
(
    workspace_id      String,
    hour              DateTime,
    agent_name        LowCardinality(String),
    invocation_count  AggregateFunction(count, UInt8),
    error_count       AggregateFunction(countIf, UInt8, UInt8),
    total_tokens      AggregateFunction(sum, UInt32),
    total_cost        AggregateFunction(sum, Float64),
    duration_p50      AggregateFunction(quantile(0.5), Float64),
    duration_p95      AggregateFunction(quantile(0.95), Float64),
    duration_p99      AggregateFunction(quantile(0.99), Float64)
)
ENGINE = AggregatingMergeTree()
PARTITION BY toYYYYMM(hour)
ORDER BY (workspace_id, agent_name, hour);

CREATE MATERIALIZED VIEW IF NOT EXISTS agent_monitor.hourly_agent_stats_mv
TO agent_monitor.hourly_agent_stats
AS SELECT
    workspace_id,
    toStartOfHour(timestamp) AS hour,
    agent_name,
    countState(toUInt8(1))                                           AS invocation_count,
    countIfState(toUInt8(1), toUInt8(status IN ('failure', 'timeout'))) AS error_count,
    sumState(total_tokens)                                           AS total_tokens,
    sumState(estimated_cost_usd)                                     AS total_cost,
    quantileState(0.5)(duration_ms)                                  AS duration_p50,
    quantileState(0.95)(duration_ms)                                 AS duration_p95,
    quantileState(0.99)(duration_ms)                                 AS duration_p99
FROM agent_monitor.agent_executions
GROUP BY workspace_id, agent_name, hour;

-- -----------------------------------------------------------------------------
-- 2. hourly_model_usage — pre-aggregated LLM usage per hour
-- -----------------------------------------------------------------------------
-- Supports: token_rate_by_model, cost_by_model, prompt_vs_completion panels
CREATE TABLE IF NOT EXISTS agent_monitor.hourly_model_usage
(
    workspace_id      String,
    hour              DateTime,
    model             LowCardinality(String),
    provider          LowCardinality(String),
    request_count     AggregateFunction(count, UInt8),
    input_tokens      AggregateFunction(sum, UInt32),
    output_tokens     AggregateFunction(sum, UInt32),
    total_tokens      AggregateFunction(sum, UInt32),
    total_cost        AggregateFunction(sum, Float64),
    duration_p50      AggregateFunction(quantile(0.5), Float64),
    duration_p95      AggregateFunction(quantile(0.95), Float64),
    duration_p99      AggregateFunction(quantile(0.99), Float64)
)
ENGINE = AggregatingMergeTree()
PARTITION BY toYYYYMM(hour)
ORDER BY (workspace_id, model, hour);

CREATE MATERIALIZED VIEW IF NOT EXISTS agent_monitor.hourly_model_usage_mv
TO agent_monitor.hourly_model_usage
AS SELECT
    workspace_id,
    toStartOfHour(timestamp) AS hour,
    model,
    provider,
    countState(toUInt8(1))          AS request_count,
    sumState(input_tokens)          AS input_tokens,
    sumState(output_tokens)         AS output_tokens,
    sumState(total_tokens)          AS total_tokens,
    sumState(cost_usd)              AS total_cost,
    quantileState(0.5)(duration_ms) AS duration_p50,
    quantileState(0.95)(duration_ms) AS duration_p95,
    quantileState(0.99)(duration_ms) AS duration_p99
FROM agent_monitor.llm_requests
GROUP BY workspace_id, model, provider, hour;

-- -----------------------------------------------------------------------------
-- 3. hourly_tool_stats — pre-aggregated tool metrics per hour
-- -----------------------------------------------------------------------------
-- Supports: tool_latency_percentiles, tool_error_rates, retry_rate_by_tool panels
CREATE TABLE IF NOT EXISTS agent_monitor.hourly_tool_stats
(
    workspace_id      String,
    hour              DateTime,
    tool_name         LowCardinality(String),
    call_count        AggregateFunction(count, UInt8),
    error_count       AggregateFunction(countIf, UInt8, UInt8),
    retry_total       AggregateFunction(sum, UInt8),
    duration_p50      AggregateFunction(quantile(0.5), Float64),
    duration_p95      AggregateFunction(quantile(0.95), Float64),
    duration_p99      AggregateFunction(quantile(0.99), Float64)
)
ENGINE = AggregatingMergeTree()
PARTITION BY toYYYYMM(hour)
ORDER BY (workspace_id, tool_name, hour);

CREATE MATERIALIZED VIEW IF NOT EXISTS agent_monitor.hourly_tool_stats_mv
TO agent_monitor.hourly_tool_stats
AS SELECT
    workspace_id,
    toStartOfHour(timestamp) AS hour,
    tool_name,
    countState(toUInt8(1))                                     AS call_count,
    countIfState(toUInt8(1), toUInt8(status = 'error'))         AS error_count,
    sumState(retry_count)                                      AS retry_total,
    quantileState(0.5)(duration_ms)                            AS duration_p50,
    quantileState(0.95)(duration_ms)                            AS duration_p95,
    quantileState(0.99)(duration_ms)                            AS duration_p99
FROM agent_monitor.tool_calls
GROUP BY workspace_id, tool_name, hour;
