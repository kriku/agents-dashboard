import { createClient } from '@clickhouse/client';

const client = createClient({
  url: process.env.CLICKHOUSE_URL || 'http://localhost:8123',
  database: process.env.CLICKHOUSE_DB || 'agent_monitor',
  username: process.env.CLICKHOUSE_USER || 'default',
  password: process.env.CLICKHOUSE_PASSWORD || '',
  clickhouse_settings: {
    date_time_input_format: 'best_effort',
  },
});

const WORKSPACE = 'ws-acme-prod';
const AGENTS = ['code-reviewer', 'deploy-bot', 'test-runner', 'doc-writer', 'security-scanner'];
const TOOLS = ['github_pr_read', 'shell_exec', 'file_write', 'http_fetch', 'db_query', 'slack_post'];
const TOOL_TYPES = ['function', 'extension', 'datastore'] as const;
const MODELS = ['claude-sonnet-4-20250514', 'claude-haiku-4-5-20251001', 'gpt-4o'];
const PROVIDERS = ['anthropic', 'anthropic', 'openai'];
const ERROR_TYPES = ['timeout', 'rate_limit', 'context_overflow', 'tool_failure', 'validation', 'guardrail_block'];
const ERROR_STAGES = ['llm_call', 'tool_call', 'post_processing', 'guardrail'];
const ERROR_MESSAGES: Record<string, string> = {
  timeout: 'LLM request exceeded 30s deadline',
  rate_limit: 'OpenAI 429: rate limit exceeded for gpt-4o',
  context_overflow: 'Context window exceeded: 128k token limit',
  tool_failure: 'sql_query: connection pool exhausted',
  validation: "output schema validation failed: missing required field 'order_id'",
  guardrail_block: 'PII detected in output: email address',
};
const GUARDRAIL_NAMES = ['pii_filter', 'toxicity_check', 'schema_validator', 'cost_limit'];
const CODEBASE_VERSIONS = ['v1.2.0', 'v1.2.1', 'v1.3.0-rc1'];
const TASK_TYPES = ['code_review', 'deployment', 'testing', 'documentation', 'security_scan'];
const FINISH_REASONS = ['stop', 'length', 'tool_calls'];

const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

async function seed() {
  const now = Date.now();
  const start = now - DAY_MS; // 24h of data

  // --- Agent executions ---
  const executions = [];
  const errors = [];
  for (let t = start; t < now; t += MINUTE_MS) {
    const count = Math.floor(rand(1, 5));
    for (let i = 0; i < count; i++) {
      const isError = Math.random() < 0.08;
      const isTimeout = isError && Math.random() < 0.3;
      const errorType = isError ? pick(ERROR_TYPES) : null;
      const modelIdx = Math.floor(Math.random() * MODELS.length);
      const model = MODELS[modelIdx]!;
      const inputTokens = Math.floor(rand(100, 4000));
      const outputTokens = Math.floor(rand(50, 2000));
      const totalTokens = inputTokens + outputTokens;
      const costPer1k = model.includes('haiku') ? 0.001 : model.includes('gpt') ? 0.005 : 0.003;
      const traceId = crypto.randomUUID();
      const agentName = pick(AGENTS);
      const ts = new Date(t + Math.random() * MINUTE_MS).toISOString();
      const codebaseVersion = pick(CODEBASE_VERSIONS);

      executions.push({
        workspace_id: WORKSPACE,
        timestamp: ts,
        trace_id: traceId,
        span_id: crypto.randomUUID().slice(0, 16),
        agent_name: agentName,
        agent_version: '1.0.0',
        task_type: pick(TASK_TYPES),
        status: isTimeout ? 'timeout' : isError ? 'failure' : 'success',
        duration_ms: rand(200, isError ? 30000 : 15000),
        step_count: Math.floor(rand(1, 12)),
        llm_call_count: Math.floor(rand(1, 6)),
        total_tokens: totalTokens,
        estimated_cost_usd: (totalTokens / 1000) * costPer1k,
        error_type: errorType,
        error_message: errorType ? (ERROR_MESSAGES[errorType] || `Simulated ${errorType} error`) : null,
        codebase_version: codebaseVersion,
        project_id: 'proj-default',
        model,
        provider: PROVIDERS[modelIdx] || 'anthropic',
        environment: 'production',
      });

      // Insert corresponding error record
      if (isError && errorType) {
        errors.push({
          workspace_id: WORKSPACE,
          timestamp: ts,
          trace_id: traceId,
          agent_name: agentName,
          error_type: errorType,
          error_message: ERROR_MESSAGES[errorType] || `Simulated ${errorType} error`,
          error_stage: pick(ERROR_STAGES),
          codebase_version: codebaseVersion,
          stack_trace: null,
        });
      }
    }
  }

  await client.insert({
    table: 'agent_executions',
    values: executions,
    format: 'JSONEachRow',
  });
  console.log(`Inserted ${executions.length} agent executions`);

  if (errors.length > 0) {
    await client.insert({
      table: 'agent_errors',
      values: errors,
      format: 'JSONEachRow',
    });
    console.log(`Inserted ${errors.length} agent errors`);
  }

  // --- Tool calls ---
  const toolCalls = [];
  for (let t = start; t < now; t += MINUTE_MS) {
    const count = Math.floor(rand(2, 8));
    for (let i = 0; i < count; i++) {
      const isError = Math.random() < 0.05;
      toolCalls.push({
        workspace_id: WORKSPACE,
        timestamp: new Date(t + Math.random() * MINUTE_MS).toISOString(),
        trace_id: crypto.randomUUID(),
        span_id: crypto.randomUUID().slice(0, 16),
        agent_name: pick(AGENTS),
        tool_name: pick(TOOLS),
        tool_type: pick(TOOL_TYPES),
        status: isError ? 'error' : 'success',
        duration_ms: rand(50, isError ? 10000 : 3000),
        retry_count: isError ? Math.floor(rand(1, 3)) : 0,
        error_type: isError ? pick(ERROR_TYPES) : null,
        input_tokens: Math.floor(rand(0, 500)),
        output_tokens: Math.floor(rand(0, 1000)),
      });
    }
  }

  await client.insert({
    table: 'tool_calls',
    values: toolCalls,
    format: 'JSONEachRow',
  });
  console.log(`Inserted ${toolCalls.length} tool calls`);

  // --- LLM requests ---
  const llmRequests = [];
  for (let t = start; t < now; t += MINUTE_MS) {
    const count = Math.floor(rand(1, 4));
    for (let i = 0; i < count; i++) {
      const modelIdx = Math.floor(Math.random() * MODELS.length);
      const input = Math.floor(rand(100, 4000));
      const output = Math.floor(rand(50, 2000));
      const model = MODELS[modelIdx]!;
      const costPer1k = model.includes('haiku') ? 0.001 : model.includes('gpt') ? 0.005 : 0.003;
      const isStreaming = Math.random() < 0.6;
      llmRequests.push({
        workspace_id: WORKSPACE,
        timestamp: new Date(t + Math.random() * MINUTE_MS).toISOString(),
        trace_id: crypto.randomUUID(),
        span_id: crypto.randomUUID().slice(0, 16),
        agent_name: pick(AGENTS),
        model,
        provider: PROVIDERS[modelIdx] || 'anthropic',
        input_tokens: input,
        output_tokens: output,
        total_tokens: input + output,
        cost_usd: ((input + output) / 1000) * costPer1k,
        duration_ms: rand(200, 5000),
        finish_reason: pick(FINISH_REASONS),
        streaming: isStreaming,
        ttft_ms: isStreaming ? rand(50, 500) : null,
      });
    }
  }

  await client.insert({
    table: 'llm_requests',
    values: llmRequests,
    format: 'JSONEachRow',
  });
  console.log(`Inserted ${llmRequests.length} LLM requests`);

  // --- Guardrail validations ---
  const guardrails = [];
  for (let t = start; t < now; t += MINUTE_MS * 3) {
    const count = Math.floor(rand(1, 4));
    for (let i = 0; i < count; i++) {
      const result = Math.random() < 0.04 ? 'fail' : Math.random() < 0.02 ? 'warn' : 'pass';
      guardrails.push({
        workspace_id: WORKSPACE,
        timestamp: new Date(t + Math.random() * MINUTE_MS).toISOString(),
        trace_id: crypto.randomUUID(),
        agent_name: pick(AGENTS),
        guardrail_name: pick(GUARDRAIL_NAMES),
        guardrail_result: result,
        duration_ms: rand(5, 200),
        message: result !== 'pass' ? 'Guardrail triggered: potential issue detected' : null,
      });
    }
  }

  await client.insert({
    table: 'guardrail_validations',
    values: guardrails,
    format: 'JSONEachRow',
  });
  console.log(`Inserted ${guardrails.length} guardrail validations`);

  // --- Workspace dimension ---
  await client.insert({
    table: 'workspaces',
    values: [
      {
        workspace_id: WORKSPACE,
        org_id: 'org-acme',
        workspace_name: 'Production',
        org_name: 'Acme Corp',
        tier: 'enterprise',
        created_at: '2025-01-15 00:00:00',
        settings: '{}',
      },
    ],
    format: 'JSONEachRow',
  });
  console.log('Inserted workspace record');

  await client.close();
  console.log('Seed complete.');
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
