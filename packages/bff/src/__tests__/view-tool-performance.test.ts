// =============================================================================
// TCP-001..004: Tool Call Performance view tests
// =============================================================================

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app, signToken, getPanel } from './helpers.js';

const token = signToken({ workspace_id: 'ws-acme-prod' });

describe('Tool Call Performance View', () => {
  let body: any;

  it('fetch tool-call-performance', async () => {
    const res = await request(app)
      .get('/api/views/tool-call-performance')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    body = res.body;
  });

  // TCP-001: Returns all expected panels
  it('TCP-001: returns all expected panel IDs', () => {
    const ids = body.panels.map((p: any) => p.id);
    expect(ids).toContain('active_tools');
    expect(ids).toContain('total_tool_calls_24h');
    expect(ids).toContain('tool_error_rate_current');
    expect(ids).toContain('retry_rate');
    expect(ids).toContain('tool_latency_percentiles');
    expect(ids).toContain('tool_error_rates');
    expect(ids).toContain('retry_rate_by_tool');
    expect(ids).toContain('slowest_tools');
  });

  // TCP-002: tool_latency_percentiles has p50/p95/p99 series
  it('TCP-002: tool_latency_percentiles has p50, p95, p99 series', () => {
    const panel = getPanel(body, 'tool_latency_percentiles');
    expect(panel.type).toBe('timeseries');
    expect(panel.data.resultType).toBe('matrix');
    expect(panel.data.result).toHaveLength(3);
    const labels = panel.data.result.map((s: any) => s.metric.percentile);
    expect(labels).toContain('p50');
    expect(labels).toContain('p95');
    expect(labels).toContain('p99');
  });

  // TCP-003: slowest_tools is a table
  it('TCP-003: slowest_tools is a table with tool_name and latency columns', () => {
    const panel = getPanel(body, 'slowest_tools');
    expect(panel.type).toBe('table');
    expect(panel.data.resultType).toBe('vector');
    if (panel.data.result.length > 0) {
      const metric = panel.data.result[0].metric;
      expect(metric).toHaveProperty('tool_name');
      expect(metric).toHaveProperty('p95_ms');
      expect(metric).toHaveProperty('call_count');
    }
  });

  // TCP-004: Table rows sorted by p95 latency desc
  it('TCP-004: slowest_tools sorted by p95 latency descending', () => {
    const panel = getPanel(body, 'slowest_tools');
    const p95Values = panel.data.result.map((r: any) => parseFloat(r.metric.p95_ms));
    for (let i = 1; i < p95Values.length; i++) {
      expect(p95Values[i]).toBeLessThanOrEqual(p95Values[i - 1]);
    }
  });
});
