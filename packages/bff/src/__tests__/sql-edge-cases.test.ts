// =============================================================================
// SQL-014..020: SQL edge case tests
// =============================================================================
// Tests boundary conditions: empty workspace, single row, null handling, etc.
// Requires: ClickHouse running with schema applied.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import {
  app,
  signToken,
  chInsert,
  cleanWorkspace,
  getPanel,
  getStatValue,
} from './helpers.js';

const EMPTY_WS = 'ws-test-sql-empty';
const SINGLE_WS = 'ws-test-sql-single';
const EDGE_WS = 'ws-test-sql-edge';
const emptyToken = signToken({ workspace_id: EMPTY_WS });
const singleToken = signToken({ workspace_id: SINGLE_WS });
const edgeToken = signToken({ workspace_id: EDGE_WS });

beforeAll(async () => {
  await Promise.all([
    cleanWorkspace(EMPTY_WS),
    cleanWorkspace(SINGLE_WS),
    cleanWorkspace(EDGE_WS),
  ]);

  const now = new Date();
  const ts = (minutesAgo: number) =>
    new Date(now.getTime() - minutesAgo * 60_000).toISOString();

  // SQL-015: Single data point
  await chInsert('agent_executions', [
    {
      workspace_id: SINGLE_WS,
      timestamp: ts(5),
      trace_id: 'trace-single',
      span_id: 'span-single',
      agent_name: 'solo-agent',
      status: 'success',
      duration_ms: 250,
      step_count: 3,
      llm_call_count: 1,
      total_tokens: 500,
      estimated_cost_usd: 0.05,
      codebase_version: 'v1.0.0',
      project_id: 'test-project',
      model: 'test-model',
      provider: 'test-provider',
      environment: 'production',
    },
  ]);

  // SQL-016: Very long agent name (200 chars)
  const longName = 'a'.repeat(200);
  await chInsert('agent_executions', [
    {
      workspace_id: EDGE_WS,
      timestamp: ts(5),
      trace_id: 'trace-long',
      span_id: 'span-long',
      agent_name: longName,
      status: 'success',
      duration_ms: 100,
      step_count: 1,
      llm_call_count: 1,
      total_tokens: 100,
      estimated_cost_usd: 0.01,
      codebase_version: 'v1.0.0',
      project_id: 'test-project',
      model: 'test-model',
      provider: 'test-provider',
      environment: 'production',
    },
  ]);

  // SQL-017: Agent errors with empty error_type
  await chInsert('agent_errors', [
    {
      workspace_id: EDGE_WS,
      timestamp: ts(5),
      trace_id: 'trace-nullerr',
      agent_name: longName,
      error_type: '',
      error_message: 'Unknown error',
      error_stage: 'post_processing',
      codebase_version: 'v1.0.0',
      stack_trace: '',
    },
    {
      workspace_id: EDGE_WS,
      timestamp: ts(5),
      trace_id: 'trace-realerr',
      agent_name: longName,
      error_type: 'timeout',
      error_message: 'Request timed out',
      error_stage: 'llm_call',
      codebase_version: 'v1.0.0',
      stack_trace: '',
    },
  ]);

  // SQL-019: Future timestamp (1 hour from now)
  await chInsert('agent_executions', [
    {
      workspace_id: EDGE_WS,
      timestamp: new Date(now.getTime() + 3600_000).toISOString(),
      trace_id: 'trace-future',
      span_id: 'span-future',
      agent_name: 'future-agent',
      status: 'success',
      duration_ms: 100,
      step_count: 1,
      llm_call_count: 1,
      total_tokens: 999999, // distinctive value
      estimated_cost_usd: 0.01,
      codebase_version: 'v1.0.0',
      project_id: 'test-project',
      model: 'test-model',
      provider: 'test-provider',
      environment: 'production',
    },
  ]);
});

afterAll(async () => {
  await Promise.all([
    cleanWorkspace(EMPTY_WS),
    cleanWorkspace(SINGLE_WS),
    cleanWorkspace(EDGE_WS),
  ]);
});

describe('SQL Edge Cases', () => {
  // SQL-014: Empty workspace returns zeros
  it('SQL-014: empty workspace returns zero stat values', async () => {
    const res = await request(app)
      .get('/api/views/agent-overview')
      .set('Authorization', `Bearer ${emptyToken}`);
    expect(res.status).toBe(200);
    expect(getStatValue(getPanel(res.body, 'active_agents'))).toBe(0);
    expect(getStatValue(getPanel(res.body, 'total_invocations_24h'))).toBe(0);
    expect(getStatValue(getPanel(res.body, 'error_rate_current'))).toBe(0);
  });

  it('SQL-014: empty workspace returns empty timeseries', async () => {
    const res = await request(app)
      .get('/api/views/agent-overview')
      .set('Authorization', `Bearer ${emptyToken}`);
    const panel = getPanel(res.body, 'invocation_rate');
    expect(panel.data.result).toHaveLength(0);
  });

  // SQL-015: Single data point doesn't crash
  it('SQL-015: single execution returns valid responses for all views', async () => {
    const viewIds = [
      'agent-overview',
      'tool-call-performance',
      'llm-token-usage',
      'error-breakdown',
      'cost-tracking',
    ];
    for (const viewId of viewIds) {
      const res = await request(app)
        .get(`/api/views/${viewId}`)
        .set('Authorization', `Bearer ${singleToken}`);
      expect(res.status, `${viewId} should return 200`).toBe(200);
      expect(res.body.panels.length).toBeGreaterThan(0);
    }
  });

  // SQL-016: Very long agent name handled
  it('SQL-016: 200-char agent name appears in results', async () => {
    const res = await request(app)
      .get('/api/views/agent-overview')
      .set('Authorization', `Bearer ${edgeToken}`);
    expect(res.status).toBe(200);
    const panel = getPanel(res.body, 'active_agents');
    const count = getStatValue(panel);
    // Should count the long-named agent (and possibly future-agent)
    expect(count).toBeGreaterThanOrEqual(1);
  });

  // SQL-017: Empty error_type handled in bar chart
  it('SQL-017: errors_by_type bar chart handles empty error_type', async () => {
    const res = await request(app)
      .get('/api/views/agent-overview')
      .set('Authorization', `Bearer ${edgeToken}`);
    const panel = getPanel(res.body, 'errors_by_type');
    // Should have results (the timeout error and possibly the empty type)
    expect(panel.data.result.length).toBeGreaterThan(0);
    // Each entry should have a string error_type (may be empty string)
    for (const r of panel.data.result) {
      expect(typeof r.metric.error_type).toBe('string');
    }
  });

  // SQL-018: Division by zero in error rate
  it('SQL-018: error rate returns 0 for empty workspace (no div by zero)', async () => {
    const res = await request(app)
      .get('/api/views/agent-overview')
      .set('Authorization', `Bearer ${emptyToken}`);
    const rate = getStatValue(getPanel(res.body, 'error_rate_current'));
    expect(rate).toBe(0);
    expect(Number.isFinite(rate)).toBe(true);
  });

  // SQL-019: Future timestamps
  // Note: Current queries use `timestamp > now() - INTERVAL` which includes future rows.
  // This test documents current behavior.
  it('SQL-019: future timestamps are included in current queries', async () => {
    const res = await request(app)
      .get('/api/views/agent-overview')
      .set('Authorization', `Bearer ${edgeToken}`);
    const total = getStatValue(getPanel(res.body, 'total_invocations_24h'));
    // Should include the future row + the past row = 2
    expect(total).toBeGreaterThanOrEqual(2);
  });

  // SQL-020: Cost projection handles month boundaries (doesn't divide by zero)
  it('SQL-020: projected monthly cost does not crash or return NaN', async () => {
    // Use the edge workspace which has at least 1 execution with cost
    const res = await request(app)
      .get('/api/views/cost-tracking')
      .set('Authorization', `Bearer ${edgeToken}`);
    const panel = getPanel(res.body, 'projected_monthly_cost');
    const value = getStatValue(panel);
    expect(Number.isFinite(value)).toBe(true);
    expect(value).toBeGreaterThanOrEqual(0);
  });
});
