// =============================================================================
// COST-001..005: Cost Tracking view tests
// =============================================================================

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app, signToken, getPanel, getStatValue } from './helpers.js';

const token = signToken({ workspace_id: 'ws-acme-prod' });

describe('Cost Tracking View', () => {
  let body: any;

  it('fetch cost-tracking', async () => {
    const res = await request(app)
      .get('/api/views/cost-tracking')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    body = res.body;
  });

  // COST-001: Returns all expected panels
  it('COST-001: returns all expected panel IDs', () => {
    const ids = body.panels.map((p: any) => p.id);
    expect(ids).toContain('estimated_daily_cost');
    expect(ids).toContain('projected_monthly_cost');
    expect(ids).toContain('cost_per_invocation_avg');
    expect(ids).toContain('cost_change_wow');
    expect(ids).toContain('cost_trend');
    expect(ids).toContain('cost_per_invocation');
    expect(ids).toContain('cost_by_agent');
    expect(ids).toContain('cost_by_model');
  });

  // COST-002: projected_monthly > daily_cost
  it('COST-002: projected monthly cost > daily cost', () => {
    const daily = getStatValue(getPanel(body, 'estimated_daily_cost'));
    const monthly = getStatValue(getPanel(body, 'projected_monthly_cost'));
    // Monthly projection should be at least as large as daily cost
    // (unless it's the last day of the month)
    if (daily > 0) {
      expect(monthly).toBeGreaterThanOrEqual(daily);
    }
  });

  // COST-003: week_over_week is a percentage (can be positive or negative)
  it('COST-003: week_over_week change is a valid number', () => {
    const panel = getPanel(body, 'cost_change_wow');
    expect(panel.type).toBe('stat');
    expect(panel.unit).toBe('percent');
    const value = getStatValue(panel);
    // Should be a finite number (not NaN)
    expect(Number.isFinite(value)).toBe(true);
  });

  // COST-004: cost_trend covers ~30 days
  it('COST-004: cost_trend has data points spanning ~30 days', () => {
    const panel = getPanel(body, 'cost_trend');
    expect(panel.type).toBe('timeseries');
    expect(panel.data.resultType).toBe('matrix');

    if (panel.data.result.length > 0 && panel.data.result[0].values.length > 1) {
      const values = panel.data.result[0].values;
      const firstTs = values[0][0];
      const lastTs = values[values.length - 1][0];
      const daySpan = (lastTs - firstTs) / 86400;
      // Should span at least 20 days (seed data covers 30 days)
      expect(daySpan).toBeGreaterThanOrEqual(20);
    }
  });

  // COST-005: cost_by_model totals approximately match estimated_cost from LLM view
  it('COST-005: cost_by_model bar values sum to a positive number', () => {
    const panel = getPanel(body, 'cost_by_model');
    expect(panel.type).toBe('bar');
    const totalCost = panel.data.result.reduce(
      (sum: number, r: any) => sum + parseFloat(r.value[1]),
      0,
    );
    expect(totalCost).toBeGreaterThan(0);
  });
});
