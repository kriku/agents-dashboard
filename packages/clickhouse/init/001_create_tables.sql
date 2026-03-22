-- =============================================================================
-- AI Agent Monitoring Platform — ClickHouse Schema
-- =============================================================================
-- Aligned with: specs/01-development-plan.md (Phase 1), frontend mock data,
-- and BFF API contract. Uses workspace_id as the tenant isolation key.
-- =============================================================================

CREATE DATABASE IF NOT EXISTS agent_monitor;

-- -----------------------------------------------------------------------------
-- 1. agent_executions — one row per agent invocation
-- -----------------------------------------------------------------------------
-- Previously: agent_invocations. Renamed to match dev plan.
-- Columns added: task_type, llm_call_count, total_tokens, estimated_cost_usd,
--   codebase_version, project_id (needed by cost-per-invocation, errors-by-version panels)
-- Status expanded: success/failure/timeout/partial (was: ok/error)
CREATE TABLE IF NOT EXISTS agent_monitor.agent_executions
(
    workspace_id      String,                -- tenant isolation key (e.g. 'ws-acme-prod')
    timestamp         DateTime64(3),
    trace_id          String,
    span_id           String,
    agent_name        LowCardinality(String),
    agent_version     String,
    task_type         LowCardinality(String),
    status            Enum8('success' = 1, 'failure' = 2, 'timeout' = 3, 'partial' = 4),
    duration_ms       Float64,
    step_count        UInt16,
    llm_call_count    UInt16,
    total_tokens      UInt32,
    estimated_cost_usd Float64,
    error_type        Nullable(LowCardinality(String)),
    error_message     Nullable(String),
    codebase_version  LowCardinality(String),
    project_id        String,
    model             LowCardinality(String),
    provider          LowCardinality(String),
    environment       LowCardinality(String)
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (workspace_id, agent_name, timestamp)
TTL toDateTime(timestamp) + INTERVAL 90 DAY;

-- -----------------------------------------------------------------------------
-- 2. tool_calls — one row per tool invocation within an agent execution
-- -----------------------------------------------------------------------------
-- Status expanded: success/error/vetoed (was: ok/error)
-- Columns added: tool_type, input_tokens, output_tokens
CREATE TABLE IF NOT EXISTS agent_monitor.tool_calls
(
    workspace_id      String,
    timestamp         DateTime64(3),
    trace_id          String,
    span_id           String,
    agent_name        LowCardinality(String),
    tool_name         LowCardinality(String),
    tool_type         Enum8('function' = 1, 'extension' = 2, 'datastore' = 3),
    status            Enum8('success' = 1, 'error' = 2, 'vetoed' = 3),
    duration_ms       Float64,
    retry_count       UInt8,
    error_type        Nullable(LowCardinality(String)),
    input_tokens      UInt32,
    output_tokens     UInt32
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (workspace_id, tool_name, timestamp)
TTL toDateTime(timestamp) + INTERVAL 90 DAY;

-- -----------------------------------------------------------------------------
-- 3. llm_requests — one row per LLM API call
-- -----------------------------------------------------------------------------
-- Previously: llm_token_usage. Renamed to match dev plan.
-- Uses input_tokens/output_tokens (matching frontend mock labels "input"/"output")
-- Columns added: finish_reason, streaming, ttft_ms
CREATE TABLE IF NOT EXISTS agent_monitor.llm_requests
(
    workspace_id      String,
    timestamp         DateTime64(3),
    trace_id          String,
    span_id           String,
    agent_name        LowCardinality(String),
    model             LowCardinality(String),
    provider          LowCardinality(String),
    input_tokens      UInt32,
    output_tokens     UInt32,
    total_tokens      UInt32,
    cost_usd          Float64,
    duration_ms       Float64,
    finish_reason     LowCardinality(String),
    streaming         Bool DEFAULT false,
    ttft_ms           Nullable(Float64)
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (workspace_id, model, timestamp)
TTL toDateTime(timestamp) + INTERVAL 90 DAY;

-- -----------------------------------------------------------------------------
-- 4. agent_errors — denormalized error detail for error breakdown view
-- -----------------------------------------------------------------------------
-- NEW table: enables efficient error-by-type, error-by-agent, error-by-version
-- queries without scanning agent_executions. ORDER BY error_type for fast grouping.
CREATE TABLE IF NOT EXISTS agent_monitor.agent_errors
(
    workspace_id      String,
    timestamp         DateTime64(3),
    trace_id          String,
    agent_name        LowCardinality(String),
    error_type        LowCardinality(String),   -- timeout, rate_limit, tool_failure, validation, guardrail_block, context_overflow
    error_message     String,
    error_stage       LowCardinality(String),    -- llm_call, tool_call, post_processing, guardrail
    codebase_version  LowCardinality(String),
    stack_trace       Nullable(String)
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (workspace_id, error_type, timestamp)
TTL toDateTime(timestamp) + INTERVAL 90 DAY;

-- -----------------------------------------------------------------------------
-- 5. guardrail_validations — guardrail pass/fail/warn events
-- -----------------------------------------------------------------------------
-- NEW table: backs the guardrail_pass_fail panel in agent-overview.
-- Metric #46: guardrail.validation.result
CREATE TABLE IF NOT EXISTS agent_monitor.guardrail_validations
(
    workspace_id      String,
    timestamp         DateTime64(3),
    trace_id          String,
    agent_name        LowCardinality(String),
    guardrail_name    LowCardinality(String),
    guardrail_result  Enum8('pass' = 1, 'fail' = 2, 'warn' = 3),
    duration_ms       Float64,
    message           Nullable(String)
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (workspace_id, guardrail_name, timestamp)
TTL toDateTime(timestamp) + INTERVAL 90 DAY;

-- -----------------------------------------------------------------------------
-- 6. workspaces — dimension table for tenant metadata
-- -----------------------------------------------------------------------------
-- NEW table: maps workspace_id ↔ org_id for multi-tenant queries.
CREATE TABLE IF NOT EXISTS agent_monitor.workspaces
(
    workspace_id      String,
    org_id            String,
    workspace_name    String,
    org_name          String,
    tier              Enum8('free' = 1, 'pro' = 2, 'enterprise' = 3),
    created_at        DateTime,
    settings          String DEFAULT '{}'  -- JSON blob
)
ENGINE = ReplacingMergeTree(created_at)
ORDER BY (org_id, workspace_id);
