// =============================================================================
// AO-001..008: Agent Overview view tests
// =============================================================================

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app, signToken, getPanel, getStatValue } from './helpers.js';

const token = signToken({ workspace_id: 'ws-acme-prod' });

describe('Agent Overview View', () => {
  let body: any;

  it('fetch agent-overview', async () => {
    const res = await request(app)
      .get('/api/views/agent-overview')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    body = res.body;
  });

  // AO-001: Returns view metadata
  it('AO-001: view metadata has correct id and refreshSec', () => {
    expect(body.view.id).toBe('agent-overview');
    expect(body.view.refreshSec).toBe(30);
    expect(body.view.title).toBeDefined();
    expect(body.view.description).toBeDefined();
  });

  // AO-002: Returns all expected panels
  it('AO-002: returns all expected panel IDs', () => {
    const ids = body.panels.map((p: any) => p.id);
    expect(ids).toContain('active_agents');
    expect(ids).toContain('total_invocations_24h');
    expect(ids).toContain('error_rate_current');
    expect(ids).toContain('p95_latency_current');
    expect(ids).toContain('invocation_rate');
    expect(ids).toContain('error_rate');
    expect(ids).toContain('errors_by_type');
    expect(ids).toContain('p95_latency');
    expect(ids).toContain('step_distribution');
  });

  // AO-003: active_agents is a stat panel
  it('AO-003: active_agents is a stat panel with vector data', () => {
    const panel = getPanel(body, 'active_agents');
    expect(panel.type).toBe('stat');
    expect(panel.data.resultType).toBe('vector');
    expect(panel.data.result).toHaveLength(1);
  });

  // AO-004: invocation_rate is timeseries with agent_name labels
  it('AO-004: invocation_rate is timeseries with agent_name labels', () => {
    const panel = getPanel(body, 'invocation_rate');
    expect(panel.type).toBe('timeseries');
    expect(panel.data.resultType).toBe('matrix');
    if (panel.data.result.length > 0) {
      expect(panel.data.result[0].metric).toHaveProperty('agent_name');
    }
  });

  // AO-005: errors_by_type is a bar panel
  it('AO-005: errors_by_type is a bar panel', () => {
    const panel = getPanel(body, 'errors_by_type');
    expect(panel.type).toBe('bar');
    expect(panel.data.resultType).toBe('vector');
  });

  // AO-006: step_distribution is a heatmap
  it('AO-006: step_distribution is a heatmap', () => {
    const panel = getPanel(body, 'step_distribution');
    expect(panel.type).toBe('heatmap');
    expect(panel.data.resultType).toBe('matrix');
  });

  // AO-007: Stat values are non-negative
  it('AO-007: stat values are non-negative', () => {
    expect(getStatValue(getPanel(body, 'active_agents'))).toBeGreaterThanOrEqual(0);
    expect(getStatValue(getPanel(body, 'total_invocations_24h'))).toBeGreaterThanOrEqual(0);
  });

  // AO-008: Error rate is a percentage 0-100
  it('AO-008: error rate is between 0 and 100', () => {
    const rate = getStatValue(getPanel(body, 'error_rate_current'));
    expect(rate).toBeGreaterThanOrEqual(0);
    expect(rate).toBeLessThanOrEqual(100);
  });
});
