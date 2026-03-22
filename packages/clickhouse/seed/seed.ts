import { createClient } from '@clickhouse/client';

const client = createClient({
  url: process.env.CLICKHOUSE_URL || 'http://localhost:8123',
  database: process.env.CLICKHOUSE_DB || 'agent_monitor',
  username: process.env.CLICKHOUSE_USER || 'default',
  password: process.env.CLICKHOUSE_PASSWORD || '',
});

const TENANT = 'org-acme__ws-prod';
const AGENTS = ['code-reviewer', 'deploy-bot', 'test-runner', 'doc-writer', 'security-scanner'];
const TOOLS = ['github_pr_read', 'shell_exec', 'file_write', 'http_fetch', 'db_query', 'slack_post'];
const MODELS = ['claude-sonnet-4-20250514', 'claude-haiku-4-5-20251001', 'gpt-4o'];
const PROVIDERS = ['anthropic', 'anthropic', 'openai'];
const ERRORS = ['timeout', 'rate_limit', 'context_overflow', 'tool_failure', 'auth_error'];

const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

async function seed() {
  const now = Date.now();
  const start = now - DAY_MS; // 24h of data

  // --- Agent invocations ---
  const invocations = [];
  for (let t = start; t < now; t += MINUTE_MS) {
    const count = Math.floor(rand(1, 5));
    for (let i = 0; i < count; i++) {
      const isError = Math.random() < 0.08;
      invocations.push({
        tenant_id: TENANT,
        timestamp: new Date(t + Math.random() * MINUTE_MS).toISOString(),
        trace_id: crypto.randomUUID(),
        span_id: crypto.randomUUID().slice(0, 16),
        agent_name: pick(AGENTS),
        agent_version: '1.0.0',
        status: isError ? 'error' : 'ok',
        duration_ms: rand(200, isError ? 30000 : 15000),
        step_count: Math.floor(rand(1, 12)),
        error_type: isError ? pick(ERRORS) : '',
        error_message: isError ? `Simulated ${pick(ERRORS)} error` : '',
        model: pick(MODELS),
        provider: PROVIDERS[MODELS.indexOf(pick(MODELS))] || 'anthropic',
        environment: 'production',
      });
    }
  }

  await client.insert({
    table: 'agent_invocations',
    values: invocations,
    format: 'JSONEachRow',
  });
  console.log(`Inserted ${invocations.length} agent invocations`);

  // --- Tool calls ---
  const toolCalls = [];
  for (let t = start; t < now; t += MINUTE_MS) {
    const count = Math.floor(rand(2, 8));
    for (let i = 0; i < count; i++) {
      const isError = Math.random() < 0.05;
      toolCalls.push({
        tenant_id: TENANT,
        timestamp: new Date(t + Math.random() * MINUTE_MS).toISOString(),
        trace_id: crypto.randomUUID(),
        span_id: crypto.randomUUID().slice(0, 16),
        agent_name: pick(AGENTS),
        tool_name: pick(TOOLS),
        status: isError ? 'error' : 'ok',
        duration_ms: rand(50, isError ? 10000 : 3000),
        retry_count: isError ? Math.floor(rand(1, 3)) : 0,
        error_type: isError ? pick(ERRORS) : '',
      });
    }
  }

  await client.insert({
    table: 'tool_calls',
    values: toolCalls,
    format: 'JSONEachRow',
  });
  console.log(`Inserted ${toolCalls.length} tool calls`);

  // --- LLM token usage ---
  const tokenUsage = [];
  for (let t = start; t < now; t += MINUTE_MS) {
    const count = Math.floor(rand(1, 4));
    for (let i = 0; i < count; i++) {
      const modelIdx = Math.floor(Math.random() * MODELS.length);
      const input = Math.floor(rand(100, 4000));
      const output = Math.floor(rand(50, 2000));
      const model = MODELS[modelIdx]!;
      const costPer1k = model.includes('haiku') ? 0.001 : model.includes('gpt') ? 0.005 : 0.003;
      tokenUsage.push({
        tenant_id: TENANT,
        timestamp: new Date(t + Math.random() * MINUTE_MS).toISOString(),
        trace_id: crypto.randomUUID(),
        agent_name: pick(AGENTS),
        model,
        provider: PROVIDERS[modelIdx] || 'anthropic',
        input_tokens: input,
        output_tokens: output,
        total_tokens: input + output,
        cost_usd: ((input + output) / 1000) * costPer1k,
        duration_ms: rand(200, 5000),
      });
    }
  }

  await client.insert({
    table: 'llm_token_usage',
    values: tokenUsage,
    format: 'JSONEachRow',
  });
  console.log(`Inserted ${tokenUsage.length} token usage records`);

  await client.close();
  console.log('Seed complete.');
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
