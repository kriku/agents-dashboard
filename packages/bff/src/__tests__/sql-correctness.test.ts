// =============================================================================
// SQL-001..008: ClickHouse query correctness tests
// =============================================================================
// Uses controlled test data in a dedicated workspace to verify SQL math.
// Requires: ClickHouse running with schema applied.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app, signToken, chInsert, cleanWorkspace, getPanel, getStatValue } from './helpers.js';

const WS = 'ws-test-sql-correctness';
const token = signToken({ workspace_id: WS });

beforeAll(async () => {
  await cleanWorkspace(WS);

  const now = new Date();
  const ts = (minutesAgo: number) =>
    new Date(now.getTime() - minutesAgo * 60_000).toISOString();

  // SQL-001 & SQL-002: 100 agent executions — 95 success, 5 failure
  // Duration 1..100ms (row i has duration_ms = i+1)
  const executions = Array.from({ length: 100 }, (_, i) => ({
    workspace_id: WS,
    timestamp: ts(Math.floor(Math.random() * 30)), // within last 30 min
    trace_id: `trace-sql-${i}`,
    span_id: `span-sql-${i}`,
    agent_name: `test-agent-${(i % 3) + 1}`, // 3 distinct agents
    status: i < 95 ? 'success' : 'failure',
    duration_ms: i + 1,
    step_count: (i % 5) + 1,
    llm_call_count: 1,
    total_tokens: 100,
    estimated_cost_usd: 0.01,
    codebase_version: 'v1.0.0',
    project_id: 'test-project',
    model: 'test-model',
    provider: 'test-provider',
    environment: 'production',
  }));
  await chInsert('agent_executions', executions);

  // SQL-004: 3 LLM requests with 10000, 20000, 30000 tokens
  const llmRequests = [10000, 20000, 30000].map((tokens, i) => ({
    workspace_id: WS,
    timestamp: ts(5),
    trace_id: `trace-llm-${i}`,
    span_id: `span-llm-${i}`,
    agent_name: 'test-agent-1',
    model: 'test-model',
    provider: 'test-provider',
    input_tokens: Math.floor(tokens * 0.6),
    output_tokens: Math.floor(tokens * 0.4),
    total_tokens: tokens,
    cost_usd: tokens * 0.00003, // $30/MTok → gives visible cost
    duration_ms: 200,
    finish_reason: 'stop',
    streaming: 0,
    ttft_ms: 100,
  }));
  await chInsert('llm_requests', llmRequests);

  // SQL-006: Data for distinct agent count — 3 agents, 10 rows each
  // (already covered by executions above with 3 distinct agents)

  // SQL-007: Errors for bar chart sorting
  const errors = [
    ...Array.from({ length: 10 }, (_, i) => ({
      workspace_id: WS,
      timestamp: ts(5),
      trace_id: `trace-err-a-${i}`,
      agent_name: 'test-agent-1',
      error_type: 'timeout',
      error_message: 'Request timed out',
      error_stage: 'llm_call',
      codebase_version: 'v1.0.0',
      stack_trace: '',
    })),
    ...Array.from({ length: 5 }, (_, i) => ({
      workspace_id: WS,
      timestamp: ts(5),
      trace_id: `trace-err-b-${i}`,
      agent_name: 'test-agent-2',
      error_type: 'rate_limit',
      error_message: 'Rate limited',
      error_stage: 'llm_call',
      codebase_version: 'v1.0.0',
      stack_trace: '',
    })),
    ...Array.from({ length: 2 }, (_, i) => ({
      workspace_id: WS,
      timestamp: ts(5),
      trace_id: `trace-err-c-${i}`,
      agent_name: 'test-agent-3',
      error_type: 'auth_error',
      error_message: 'Auth failed',
      error_stage: 'tool_call',
      codebase_version: 'v1.0.0',
      stack_trace: '',
    })),
  ];
  await chInsert('agent_errors', errors);

  // SQL-008: 15 distinct tools for LIMIT 10 test
  const toolCalls = Array.from({ length: 15 }, (_, i) => ({
    workspace_id: WS,
    timestamp: ts(5),
    trace_id: `trace-tool-${i}`,
    span_id: `span-tool-${i}`,
    agent_name: 'test-agent-1',
    tool_name: `tool-${String(i).padStart(2, '0')}`,
    tool_type: 'function',
    status: 'success',
    duration_ms: (i + 1) * 100,
    retry_count: 0,
    input_tokens: 10,
    output_tokens: 10,
  }));
  await chInsert('tool_calls', toolCalls);
});

afterAll(async () => {
  await cleanWorkspace(WS);
});

describe('SQL Correctness', () => {
  // SQL-001: Error rate math — 5 failures out of 100 = 5.0%
  it('SQL-001: error rate is ~5%', async () => {
    const res = await request(app)
      .get('/api/views/agent-overview')
      .set('Authorization', `Bearer ${token}`);
    const panel = getPanel(res.body, 'error_rate_current');
    const rate = getStatValue(panel);
    expect(rate).toBeCloseTo(5.0, 0);
  });

  // SQL-002: P95 latency — 100 rows with duration 1..100ms → p95 ≈ 95ms = 0.095s
  it('SQL-002: p95 latency is approximately 95ms', async () => {
    const res = await request(app)
      .get('/api/views/agent-overview')
      .set('Authorization', `Bearer ${token}`);
    const panel = getPanel(res.body, 'p95_latency_current');
    const p95 = getStatValue(panel);
    // p95 of 1..100 should be around 95ms = 0.095s (±10ms tolerance)
    expect(p95).toBeGreaterThan(0.08);
    expect(p95).toBeLessThan(0.11);
  });

  // SQL-003: Time bucketing groups into 5-minute intervals
  it('SQL-003: invocation_rate groups by 5-minute buckets', async () => {
    const res = await request(app)
      .get('/api/views/agent-overview')
      .set('Authorization', `Bearer ${token}`);
    const panel = getPanel(res.body, 'invocation_rate');
    expect(panel.data.resultType).toBe('matrix');
    // There should be some series with values
    if (panel.data.result.length > 0) {
      // Each series should have timestamp-value pairs
      const values = panel.data.result[0].values;
      expect(values.length).toBeGreaterThan(0);
      // Check timestamps are roughly 5 minutes apart
      if (values.length >= 2) {
        const diff = values[1][0] - values[0][0];
        expect(diff).toBe(300); // 5 minutes in seconds
      }
    }
  });

  // SQL-004: Token aggregation — 10000 + 20000 + 30000 = 60000 tokens
  it('SQL-004: total tokens sums correctly', async () => {
    const res = await request(app)
      .get('/api/views/llm-token-usage')
      .set('Authorization', `Bearer ${token}`);
    const panel = getPanel(res.body, 'total_tokens_24h');
    const total = getStatValue(panel);
    expect(total).toBe(60000);
  });

  // SQL-005: Cost calculation — total cost_usd = 0.3 + 0.6 + 0.9 = 1.80
  it('SQL-005: cost uses correct formula', async () => {
    const res = await request(app)
      .get('/api/views/llm-token-usage')
      .set('Authorization', `Bearer ${token}`);
    const panel = getPanel(res.body, 'estimated_cost_24h');
    const cost = getStatValue(panel);
    // Sum of cost_usd: 10000*0.00003 + 20000*0.00003 + 30000*0.00003 = 1.80
    expect(cost).toBeCloseTo(1.80, 1);
  });

  // SQL-006: DISTINCT agent_name counts correctly — 3 agents
  it('SQL-006: active agents count is 3', async () => {
    const res = await request(app)
      .get('/api/views/agent-overview')
      .set('Authorization', `Bearer ${token}`);
    const panel = getPanel(res.body, 'active_agents');
    const count = getStatValue(panel);
    expect(count).toBe(3);
  });

  // SQL-007: Bar chart results sorted descending
  it('SQL-007: errors_by_type sorted descending by count', async () => {
    const res = await request(app)
      .get('/api/views/agent-overview')
      .set('Authorization', `Bearer ${token}`);
    const panel = getPanel(res.body, 'errors_by_type');
    const values = panel.data.result.map((r: any) => parseFloat(r.value[1]));
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeLessThanOrEqual(values[i - 1]);
    }
    // First should be 'timeout' with 10 errors
    expect(panel.data.result[0].metric.error_type).toBe('timeout');
  });

  // SQL-008: Table query respects LIMIT — 15 tools, limit 10
  it('SQL-008: slowest_tools returns at most 10 rows', async () => {
    const res = await request(app)
      .get('/api/views/tool-call-performance')
      .set('Authorization', `Bearer ${token}`);
    const panel = getPanel(res.body, 'slowest_tools');
    expect(panel.data.result.length).toBeLessThanOrEqual(10);
  });
});
