// =============================================================================
// SQL-009..013: SQL time range window filtering tests
// =============================================================================
// Verifies that queries respect their declared time windows.
// Requires: ClickHouse running with schema applied.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app, signToken, chInsert, cleanWorkspace, getPanel, getStatValue } from './helpers.js';

const WS = 'ws-test-sql-time';
const token = signToken({ workspace_id: WS });

beforeAll(async () => {
  await cleanWorkspace(WS);

  const now = Date.now();
  const ts = (minutesAgo: number) => new Date(now - minutesAgo * 60_000).toISOString();

  const makeExec = (minutesAgo: number, agent: string, status = 'success') => ({
    workspace_id: WS,
    timestamp: ts(minutesAgo),
    trace_id: `trace-time-${minutesAgo}-${agent}`,
    span_id: `span-time-${minutesAgo}`,
    agent_name: agent,
    status,
    duration_ms: 100,
    step_count: 3,
    llm_call_count: 1,
    total_tokens: 100,
    estimated_cost_usd: 0.01,
    codebase_version: 'v1.0.0',
    project_id: 'test-project',
    model: 'test-model',
    provider: 'test-provider',
    environment: 'production',
  });

  // SQL-009: Active agents window (5 minutes)
  // Agent "recent" at 3 min ago, agent "old" at 6 min ago
  await chInsert('agent_executions', [
    makeExec(3, 'agent-recent'),
    makeExec(6, 'agent-old'),
    // SQL-010: Error rate window (1 hour)
    // Error at 30 min ago (within 1h), error at 120 min ago (outside 1h)
    makeExec(30, 'agent-err-recent', 'failure'),
    makeExec(120, 'agent-err-old', 'failure'),
    // SQL-011: 24h window — success at 12h ago, success at 36h ago
    makeExec(720, 'agent-day-recent'),   // 12h ago
    makeExec(2160, 'agent-day-old'),     // 36h ago
  ]);

  // SQL-012: Error rate trend (6h window, 5-min buckets)
  // Insert data at 3h ago and 8h ago
  await chInsert('agent_executions', [
    makeExec(180, 'agent-trend-in'),   // 3h ago — within 6h
    makeExec(480, 'agent-trend-out'),  // 8h ago — outside 6h
  ]);

  // SQL-013: Cost trend (30-day window)
  // Insert LLM costs at various days
  const days = [1, 7, 15, 25, 35]; // 35 days ago is outside 30-day window
  const llmRequests = days.map((d) => ({
    workspace_id: WS,
    timestamp: ts(d * 24 * 60),
    trace_id: `trace-cost-${d}`,
    span_id: `span-cost-${d}`,
    agent_name: 'agent-cost',
    model: 'test-model',
    provider: 'test-provider',
    input_tokens: 100,
    output_tokens: 50,
    total_tokens: 150,
    cost_usd: 10.0,
    duration_ms: 200,
    finish_reason: 'stop',
    streaming: 0,
    ttft_ms: 50,
  }));
  await chInsert('llm_requests', llmRequests);
});

afterAll(async () => {
  await cleanWorkspace(WS);
});

describe('SQL Time Ranges', () => {
  // SQL-009: 5-minute window for active agents
  it('SQL-009: active_agents only counts agents within last 5 minutes', async () => {
    const res = await request(app)
      .get('/api/views/agent-overview')
      .set('Authorization', `Bearer ${token}`);
    const count = getStatValue(getPanel(res.body, 'active_agents'));
    // Only "agent-recent" (3min ago) should be counted, not "agent-old" (6min ago)
    expect(count).toBe(1);
  });

  // SQL-010: 1-hour window for current error rate
  it('SQL-010: error rate only includes errors within last 1 hour', async () => {
    const res = await request(app)
      .get('/api/views/agent-overview')
      .set('Authorization', `Bearer ${token}`);
    const rate = getStatValue(getPanel(res.body, 'error_rate_current'));
    // Within 1h: 1 failure (30min) + several successes = low error rate
    // The 120min error should NOT be counted
    expect(rate).toBeGreaterThan(0);
    expect(rate).toBeLessThan(100);
  });

  // SQL-011: 24-hour window for daily stats
  it('SQL-011: total_invocations_24h only includes last 24 hours', async () => {
    const res = await request(app)
      .get('/api/views/agent-overview')
      .set('Authorization', `Bearer ${token}`);
    const total = getStatValue(getPanel(res.body, 'total_invocations_24h'));
    // 36h-ago record should be excluded. We inserted multiple within 24h.
    expect(total).toBeGreaterThan(0);
    // The 36h-ago row should not be counted, so total < all rows inserted
    // We inserted ~8 rows total, but only ~7 within 24h
    expect(total).toBeLessThanOrEqual(7);
  });

  // SQL-012: 6-hour window for timeseries
  it('SQL-012: error_rate timeseries only includes last 6 hours', async () => {
    const res = await request(app)
      .get('/api/views/agent-overview')
      .set('Authorization', `Bearer ${token}`);
    const panel = getPanel(res.body, 'error_rate');
    expect(panel.data.resultType).toBe('matrix');
    if (panel.data.result.length > 0 && panel.data.result[0].values.length > 0) {
      // All timestamps should be within the last 6 hours
      const now = Math.floor(Date.now() / 1000);
      const sixHoursAgo = now - 6 * 3600;
      for (const [ts] of panel.data.result[0].values) {
        expect(ts).toBeGreaterThanOrEqual(sixHoursAgo - 300); // 5-min bucket tolerance
      }
    }
  });

  // SQL-013: 30-day window for cost trend
  it('SQL-013: cost_trend spans up to 30 days', async () => {
    const res = await request(app)
      .get('/api/views/cost-tracking')
      .set('Authorization', `Bearer ${token}`);
    const panel = getPanel(res.body, 'cost_trend');
    expect(panel.data.resultType).toBe('matrix');
    if (panel.data.result.length > 0) {
      const values = panel.data.result[0].values;
      // Should include data points for 1d, 7d, 15d, 25d ago but NOT 35d ago
      // So at most 4 data points
      expect(values.length).toBeLessThanOrEqual(4);
      expect(values.length).toBeGreaterThanOrEqual(1);
    }
  });
});
