// =============================================================================
// Realistic seed data generator for AI Agent Monitoring Platform
// =============================================================================
// Generates 30 days of multi-workspace monitoring data with:
// - Daily traffic cycles (peak 10am-2pm UTC, drop overnight/weekends)
// - 15% week-over-week growth trend
// - Error spikes (api_call tool outage on day 22)
// - Agent-specific error rates (code-reviewer runs hot)
// - Version rollout progression
// - Guardrail validation events
// - Deterministic output (seeded PRNG, seed=42)
//
// Label values are aligned with frontend mock data (bff-mock-data.ts).
// =============================================================================

import { createClient } from '@clickhouse/client';

// ---------------------------------------------------------------------------
// Seeded PRNG (mulberry32) — deterministic across runs
// ---------------------------------------------------------------------------

function createRng(seed: number) {
  let s = seed | 0;
  function next(): number {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  return {
    /** [0, 1) */
    random: next,
    /** [min, max) */
    range(min: number, max: number) {
      return min + next() * (max - min);
    },
    /** Integer [min, max) */
    int(min: number, max: number) {
      return Math.floor(min + next() * (max - min));
    },
    /** Pick random element */
    pick<T>(arr: readonly T[]): T {
      return arr[Math.floor(next() * arr.length)]!;
    },
    /** Weighted pick: items paired with cumulative weights */
    pickWeighted<T>(items: readonly T[], weights: readonly number[]): T {
      const r = next() * weights[weights.length - 1]!;
      for (let i = 0; i < weights.length; i++) {
        if (r < weights[i]!) return items[i]!;
      }
      return items[items.length - 1]!;
    },
    /** UUID-like string */
    uuid() {
      const hex = () =>
        Math.floor(next() * 0xffff)
          .toString(16)
          .padStart(4, '0');
      return `${hex()}${hex()}-${hex()}-4${hex().slice(1)}-${hex()}-${hex()}${hex()}${hex()}`;
    },
  };
}

// ---------------------------------------------------------------------------
// Configuration — aligned with frontend mock data labels
// ---------------------------------------------------------------------------

interface WorkspaceConfig {
  workspace_id: string;
  org_id: string;
  workspace_name: string;
  org_name: string;
  tier: 'free' | 'pro' | 'enterprise';
  /** Relative traffic volume (1.0 = heavy) */
  scale: number;
}

const WORKSPACES: WorkspaceConfig[] = [
  { workspace_id: 'ws-acme-prod', org_id: 'org-acme', workspace_name: 'Production', org_name: 'Acme Corp', tier: 'enterprise', scale: 1.0 },
  { workspace_id: 'ws-acme-staging', org_id: 'org-acme', workspace_name: 'Staging', org_name: 'Acme Corp', tier: 'enterprise', scale: 0.1 },
  { workspace_id: 'ws-globex-main', org_id: 'org-globex', workspace_name: 'Main', org_name: 'Globex Inc', tier: 'pro', scale: 0.3 },
  { workspace_id: 'ws-initech-prod', org_id: 'org-initech', workspace_name: 'Production', org_name: 'Initech', tier: 'pro', scale: 0.3 },
  { workspace_id: 'ws-initech-research', org_id: 'org-initech', workspace_name: 'Research', org_name: 'Initech', tier: 'free', scale: 0.1 },
];

// Frontend mock uses these 4 agents — they must be present. Add 6 more for richness.
const AGENTS = [
  'order-processor', 'support-triage', 'doc-summarizer', 'code-reviewer',
  'data-analyst', 'email-drafter', 'search-agent', 'onboarding-assistant',
  'report-generator', 'compliance-checker',
] as const;

// Per-agent base error rate. code-reviewer runs hot (8%).
const AGENT_ERROR_RATE: Record<string, number> = {
  'order-processor': 0.03,
  'support-triage': 0.025,
  'doc-summarizer': 0.02,
  'code-reviewer': 0.08,
  'data-analyst': 0.03,
  'email-drafter': 0.02,
  'search-agent': 0.035,
  'onboarding-assistant': 0.015,
  'report-generator': 0.025,
  'compliance-checker': 0.04,
};

// Frontend mock uses these 5 tools — they must be present. Add 10 more.
const TOOLS = [
  'code_exec', 'web_search', 'api_call', 'sql_query', 'file_read',
  'file_write', 'email_send', 'slack_notify', 'jira_create', 'pdf_parse',
  'vector_search', 'calculator', 'calendar_check', 'translate', 'image_analyze',
] as const;

const TOOL_TYPE_MAP: Record<string, string> = {
  code_exec: 'function', web_search: 'extension', api_call: 'extension',
  sql_query: 'datastore', file_read: 'function', file_write: 'function',
  email_send: 'extension', slack_notify: 'extension', jira_create: 'extension',
  pdf_parse: 'function', vector_search: 'datastore', calculator: 'function',
  calendar_check: 'extension', translate: 'extension', image_analyze: 'function',
};

// Tool base latency ranges [min, max] in ms
const TOOL_LATENCY: Record<string, [number, number]> = {
  code_exec: [100, 3000], web_search: [200, 1500], api_call: [50, 800],
  sql_query: [200, 2000], file_read: [10, 200], file_write: [20, 300],
  email_send: [100, 500], slack_notify: [50, 300], jira_create: [200, 1000],
  pdf_parse: [300, 2000], vector_search: [100, 800], calculator: [5, 50],
  calendar_check: [50, 300], translate: [200, 1000], image_analyze: [500, 3000],
};

// 4 models — aligned with frontend mock. Pricing in $/token.
const MODELS = [
  { name: 'claude-sonnet-4-20250514', provider: 'anthropic', inputPrice: 3 / 1e6, outputPrice: 15 / 1e6, weight: 35 },
  { name: 'claude-haiku-4-5-20251001', provider: 'anthropic', inputPrice: 0.80 / 1e6, outputPrice: 4 / 1e6, weight: 15 },
  { name: 'gpt-4o', provider: 'openai', inputPrice: 2.50 / 1e6, outputPrice: 10 / 1e6, weight: 35 },
  { name: 'gpt-4o-mini', provider: 'openai', inputPrice: 0.15 / 1e6, outputPrice: 0.60 / 1e6, weight: 15 },
] as const;

// Cumulative weights for weighted model selection
const MODEL_WEIGHTS = MODELS.reduce<number[]>((acc, m) => {
  acc.push((acc[acc.length - 1] ?? 0) + m.weight);
  return acc;
}, []);
const MODEL_NAMES = MODELS.map((m) => m.name);

// Token-heavy agents (doc-summarizer, report-generator use 2x tokens)
const TOKEN_HEAVY_AGENTS = new Set(['doc-summarizer', 'report-generator']);

const ERROR_TYPES = ['timeout', 'rate_limit', 'tool_failure', 'validation', 'guardrail_block', 'context_overflow'] as const;
const ERROR_STAGES = ['llm_call', 'tool_call', 'post_processing', 'guardrail'] as const;
const ERROR_MESSAGES: Record<string, string[]> = {
  timeout: ['LLM request exceeded 30s deadline', 'Tool execution timed out after 60s', 'Agent execution exceeded 120s deadline'],
  rate_limit: ['OpenAI 429: rate limit exceeded for gpt-4o', 'Anthropic 429: too many requests', 'Rate limit: max 100 req/min exceeded'],
  tool_failure: ['sql_query: connection pool exhausted', 'web_search: upstream 503', 'api_call: connection refused'],
  validation: ["output schema validation failed: missing required field 'order_id'", 'Input validation: payload exceeds 10MB limit', 'JSON parse error in tool response'],
  guardrail_block: ['PII detected in output: email address', 'Toxicity score exceeded threshold', 'Cost limit exceeded for this invocation'],
  context_overflow: ['Context window exceeded: 128k token limit', 'Input truncated: exceeded model context length'],
};

const GUARDRAIL_NAMES = ['pii_filter', 'toxicity_check', 'schema_validator', 'cost_limit'] as const;
const CODEBASE_VERSIONS = ['v2.3.1', 'v2.4.0', 'v2.5.0-beta'];
const TASK_TYPES = ['code_review', 'deployment', 'testing', 'documentation', 'security_scan', 'data_analysis', 'customer_support', 'content_generation'] as const;
const FINISH_REASONS = ['stop', 'length', 'tool_calls'] as const;

const DAYS = 30;
const BATCH_SIZE = 10_000;

// Target: ~50k executions for heavy workspace over 30 days → ~1667/day → ~1.16/min
const BASE_EXECUTIONS_PER_MIN = 1.16;

// ---------------------------------------------------------------------------
// Time pattern functions
// ---------------------------------------------------------------------------

const HOUR_S = 3600;
const DAY_S = 86400;

/** Daily traffic multiplier: peak at 12pm UTC, trough at 4am UTC */
function dailyCycleMultiplier(epochSec: number): number {
  const hourOfDay = ((epochSec % DAY_S) / HOUR_S) % 24;
  // Sinusoidal: peak at 12, trough at 0/24
  const sin = Math.sin(((hourOfDay - 4) / 24) * 2 * Math.PI);
  // Map [-1, 1] to [0.4, 1.6] — 60% drop overnight
  return 1.0 + 0.6 * sin;
}

/** Weekend multiplier: 60% reduction on Sat/Sun */
function weekendMultiplier(epochSec: number): number {
  const day = new Date(epochSec * 1000).getUTCDay();
  return day === 0 || day === 6 ? 0.4 : 1.0;
}

/** 15% week-over-week growth: multiplier relative to day 0 */
function growthMultiplier(dayIndex: number): number {
  const weekIndex = dayIndex / 7;
  return Math.pow(1.15, weekIndex);
}

/** Version selection based on day index (rollout pattern) */
function pickVersion(rng: ReturnType<typeof createRng>, dayIndex: number): string {
  if (dayIndex >= 25) {
    // v2.5.0-beta at 5%, v2.4.0 at 60%, v2.3.1 at 35%
    const r = rng.random();
    if (r < 0.05) return CODEBASE_VERSIONS[2]!;
    if (r < 0.65) return CODEBASE_VERSIONS[1]!;
    return CODEBASE_VERSIONS[0]!;
  }
  if (dayIndex >= 15) {
    // Gradual rollout: v2.4.0 share increases from 10% to 55%
    const v2share = 0.10 + ((dayIndex - 15) / 10) * 0.45;
    return rng.random() < v2share ? CODEBASE_VERSIONS[1]! : CODEBASE_VERSIONS[0]!;
  }
  // First 15 days: v2.3.1 dominant (95%)
  return rng.random() < 0.95 ? CODEBASE_VERSIONS[0]! : CODEBASE_VERSIONS[1]!;
}

/** api_call tool error spike on day 22 (4-hour window) */
function isApiCallOutage(epochSec: number, dayIndex: number): boolean {
  if (dayIndex !== 22) return false;
  const hourOfDay = ((epochSec % DAY_S) / HOUR_S) % 24;
  return hourOfDay >= 10 && hourOfDay < 14; // 10am-2pm UTC
}

// ---------------------------------------------------------------------------
// Generator
// ---------------------------------------------------------------------------

async function generate() {
  const client = createClient({
    url: process.env.CLICKHOUSE_URL || 'http://localhost:8123',
    database: process.env.CLICKHOUSE_DB || 'agent_monitor',
    username: process.env.CLICKHOUSE_USER || 'default',
    password: process.env.CLICKHOUSE_PASSWORD || '',
    clickhouse_settings: {
      date_time_input_format: 'best_effort',
    },
  });

  const rng = createRng(42);
  const nowSec = Math.floor(Date.now() / 1000);
  const startSec = nowSec - DAYS * DAY_S;

  const totals = { executions: 0, toolCalls: 0, llmRequests: 0, errors: 0, guardrails: 0 };

  // --- Workspace dimension data (Step 2.2) ---
  await client.insert({
    table: 'workspaces',
    values: WORKSPACES.map((ws) => ({
      workspace_id: ws.workspace_id,
      org_id: ws.org_id,
      workspace_name: ws.workspace_name,
      org_name: ws.org_name,
      tier: ws.tier,
      created_at: new Date(startSec * 1000).toISOString().slice(0, 19).replace('T', ' '),
      settings: '{}',
    })),
    format: 'JSONEachRow',
  });
  console.log(`Inserted ${WORKSPACES.length} workspace records`);

  // --- Generate data per workspace, per day ---
  for (const ws of WORKSPACES) {
    console.log(`\nGenerating data for ${ws.workspace_id} (scale=${ws.scale})...`);

    let execBuf: Record<string, unknown>[] = [];
    let toolBuf: Record<string, unknown>[] = [];
    let llmBuf: Record<string, unknown>[] = [];
    let errBuf: Record<string, unknown>[] = [];
    let guardBuf: Record<string, unknown>[] = [];

    async function flushAll() {
      const flushBatch = async (table: string, buf: Record<string, unknown>[]) => {
        if (buf.length === 0) return;
        await client.insert({ table, values: buf, format: 'JSONEachRow' });
      };
      await flushBatch('agent_executions', execBuf);
      await flushBatch('tool_calls', toolBuf);
      await flushBatch('llm_requests', llmBuf);
      await flushBatch('agent_errors', errBuf);
      await flushBatch('guardrail_validations', guardBuf);
      totals.executions += execBuf.length;
      totals.toolCalls += toolBuf.length;
      totals.llmRequests += llmBuf.length;
      totals.errors += errBuf.length;
      totals.guardrails += guardBuf.length;
      execBuf = [];
      toolBuf = [];
      llmBuf = [];
      errBuf = [];
      guardBuf = [];
    }

    for (let day = 0; day < DAYS; day++) {
      const dayStartSec = startSec + day * DAY_S;

      // Process minute by minute
      for (let minuteOffset = 0; minuteOffset < 1440; minuteOffset++) {
        const minuteSec = dayStartSec + minuteOffset * 60;
        const rate =
          BASE_EXECUTIONS_PER_MIN *
          ws.scale *
          dailyCycleMultiplier(minuteSec) *
          weekendMultiplier(minuteSec) *
          growthMultiplier(day);

        // Poisson-ish: use rate as expected count
        const count = Math.floor(rate + (rng.random() < (rate % 1) ? 1 : 0));

        for (let i = 0; i < count; i++) {
          const tsSec = minuteSec + rng.range(0, 60);
          const tsIso = new Date(tsSec * 1000).toISOString();
          const agentName = rng.pick(AGENTS);
          const version = pickVersion(rng, day);
          const stepCount = rng.int(1, 13);
          const llmCallCount = rng.int(1, Math.min(stepCount + 1, 6));

          // Error determination
          const baseErrRate = AGENT_ERROR_RATE[agentName] ?? 0.03;
          const isError = rng.random() < baseErrRate;
          const isTimeout = isError && rng.random() < 0.3;
          const errorType = isError ? rng.pick(ERROR_TYPES) : null;

          // Model selection
          const modelName = rng.pickWeighted(MODEL_NAMES, MODEL_WEIGHTS);
          const modelDef = MODELS.find((m) => m.name === modelName)!;

          // Token counts — heavy agents use more
          const tokenMult = TOKEN_HEAVY_AGENTS.has(agentName) ? 2.0 : 1.0;
          let totalInputTokens = 0;
          let totalOutputTokens = 0;

          // Generate LLM requests for this execution
          const traceId = rng.uuid();
          for (let l = 0; l < llmCallCount; l++) {
            const inputTok = Math.floor(rng.range(100, 4000) * tokenMult);
            const outputTok = Math.floor(rng.range(50, 2000) * tokenMult);
            totalInputTokens += inputTok;
            totalOutputTokens += outputTok;
            const total = inputTok + outputTok;
            const isStreaming = rng.random() < 0.6;
            llmBuf.push({
              workspace_id: ws.workspace_id,
              timestamp: tsIso,
              trace_id: traceId,
              span_id: rng.uuid().slice(0, 16),
              agent_name: agentName,
              model: modelName,
              provider: modelDef.provider,
              input_tokens: inputTok,
              output_tokens: outputTok,
              total_tokens: total,
              cost_usd: inputTok * modelDef.inputPrice + outputTok * modelDef.outputPrice,
              duration_ms: rng.range(500, 3000) * (total / 2000), // proportional to tokens
              finish_reason: rng.pick(FINISH_REASONS),
              streaming: isStreaming,
              ttft_ms: isStreaming ? rng.range(50, 500) : null,
            });
          }

          // Generate tool calls for this execution
          const toolCallCount = rng.int(2, Math.min(stepCount * 2, 8) + 1);
          for (let tc = 0; tc < toolCallCount; tc++) {
            const toolName = rng.pick(TOOLS);
            const latencyRange = TOOL_LATENCY[toolName] ?? [50, 500];

            // api_call outage on day 22
            const isOutage = toolName === 'api_call' && isApiCallOutage(tsSec, day);
            const toolIsError = isOutage ? rng.random() < 0.35 : rng.random() < 0.03;

            toolBuf.push({
              workspace_id: ws.workspace_id,
              timestamp: tsIso,
              trace_id: traceId,
              span_id: rng.uuid().slice(0, 16),
              agent_name: agentName,
              tool_name: toolName,
              tool_type: TOOL_TYPE_MAP[toolName] ?? 'function',
              status: toolIsError ? 'error' : 'success',
              duration_ms: rng.range(latencyRange[0], toolIsError ? latencyRange[1] * 3 : latencyRange[1]),
              retry_count: toolIsError ? rng.int(1, 4) : 0,
              error_type: toolIsError ? rng.pick(ERROR_TYPES) : null,
              input_tokens: rng.int(0, 500),
              output_tokens: rng.int(0, 1000),
            });
          }

          // Total tokens / cost for execution record
          const totalTokens = totalInputTokens + totalOutputTokens;
          const totalCost = totalInputTokens * modelDef.inputPrice + totalOutputTokens * modelDef.outputPrice;

          execBuf.push({
            workspace_id: ws.workspace_id,
            timestamp: tsIso,
            trace_id: traceId,
            span_id: rng.uuid().slice(0, 16),
            agent_name: agentName,
            agent_version: '1.0.0',
            task_type: rng.pick(TASK_TYPES),
            status: isTimeout ? 'timeout' : isError ? 'failure' : 'success',
            duration_ms: rng.range(2000, isError ? 30000 : 15000) + stepCount * rng.range(500, 2000),
            step_count: stepCount,
            llm_call_count: llmCallCount,
            total_tokens: totalTokens,
            estimated_cost_usd: totalCost,
            error_type: errorType,
            error_message: errorType ? rng.pick(ERROR_MESSAGES[errorType] ?? ['Unknown error']) : null,
            codebase_version: version,
            project_id: 'proj-default',
            model: modelName,
            provider: modelDef.provider,
            environment: ws.workspace_id.includes('staging') ? 'staging' : 'production',
          });

          // Agent error record
          if (isError && errorType) {
            errBuf.push({
              workspace_id: ws.workspace_id,
              timestamp: tsIso,
              trace_id: traceId,
              agent_name: agentName,
              error_type: errorType,
              error_message: rng.pick(ERROR_MESSAGES[errorType] ?? ['Unknown error']),
              error_stage: rng.pick(ERROR_STAGES),
              codebase_version: version,
              stack_trace: null,
            });
          }

          // Guardrail validation (~1 per 3 executions)
          if (rng.random() < 0.33) {
            const gResult = rng.random() < 0.04 ? 'fail' : rng.random() < 0.03 ? 'warn' : 'pass';
            guardBuf.push({
              workspace_id: ws.workspace_id,
              timestamp: tsIso,
              trace_id: traceId,
              agent_name: agentName,
              guardrail_name: rng.pick(GUARDRAIL_NAMES),
              guardrail_result: gResult,
              duration_ms: rng.range(5, 200),
              message: gResult !== 'pass' ? rng.pick(ERROR_MESSAGES.guardrail_block ?? ['Guardrail triggered']) : null,
            });
          }
        }

        // Flush when any buffer exceeds batch size
        if (execBuf.length >= BATCH_SIZE || toolBuf.length >= BATCH_SIZE || llmBuf.length >= BATCH_SIZE) {
          await flushAll();
        }
      }

      // Flush remaining data for this day
      await flushAll();

      if ((day + 1) % 5 === 0 || day === DAYS - 1) {
        console.log(`  ${ws.workspace_id}: day ${day + 1}/${DAYS} done — running totals: ${totals.executions} exec, ${totals.toolCalls} tool, ${totals.llmRequests} llm`);
      }
    }
  }

  await client.close();

  console.log('\n=== Seed complete ===');
  console.log(`  agent_executions:      ${totals.executions.toLocaleString()}`);
  console.log(`  tool_calls:            ${totals.toolCalls.toLocaleString()}`);
  console.log(`  llm_requests:          ${totals.llmRequests.toLocaleString()}`);
  console.log(`  agent_errors:          ${totals.errors.toLocaleString()}`);
  console.log(`  guardrail_validations: ${totals.guardrails.toLocaleString()}`);
}

generate().catch((err) => {
  console.error('Generate failed:', err);
  process.exit(1);
});
