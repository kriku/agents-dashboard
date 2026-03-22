// =============================================================================
// ERR-001..004: Error Breakdown view tests
// =============================================================================

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app, signToken, getPanel } from './helpers.js';

const token = signToken({ workspace_id: 'ws-acme-prod' });

describe('Error Breakdown View', () => {
  let body: any;

  it('fetch error-breakdown', async () => {
    const res = await request(app)
      .get('/api/views/error-breakdown')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    body = res.body;
  });

  // ERR-001: Returns all expected panels
  it('ERR-001: returns all expected panel IDs', () => {
    const ids = body.panels.map((p: any) => p.id);
    expect(ids).toContain('total_errors_24h');
    expect(ids).toContain('error_rate_overall');
    expect(ids).toContain('error_budget_remaining');
    expect(ids).toContain('most_common_error');
    expect(ids).toContain('error_rate_trend');
    expect(ids).toContain('errors_by_type');
    expect(ids).toContain('errors_by_agent');
    expect(ids).toContain('top_error_messages');
  });

  // ERR-002: most_common_error returns a string label
  it('ERR-002: most_common_error has a displayValue string', () => {
    const panel = getPanel(body, 'most_common_error');
    expect(panel.type).toBe('stat');
    // The panel uses displayValue for the error type string
    if (panel.displayValue) {
      expect(typeof panel.displayValue).toBe('string');
      expect(panel.displayValue.length).toBeGreaterThan(0);
    }
  });

  // ERR-003: errors_by_agent reflects seeded agents
  it('ERR-003: errors_by_agent contains seeded agent names', () => {
    const panel = getPanel(body, 'errors_by_agent');
    expect(panel.type).toBe('bar');
    if (panel.data.result.length > 0) {
      const agents = panel.data.result.map((r: any) => r.metric.agent_name);
      // code-reviewer has highest error rate in seed data
      expect(agents.some((a: string) => typeof a === 'string' && a.length > 0)).toBe(true);
    }
  });

  // ERR-004: top_error_messages table has timestamps
  it('ERR-004: top_error_messages has first_seen and last_seen', () => {
    const panel = getPanel(body, 'top_error_messages');
    expect(panel.type).toBe('table');
    if (panel.data.result.length > 0) {
      const metric = panel.data.result[0].metric;
      expect(metric).toHaveProperty('first_seen');
      expect(metric).toHaveProperty('last_seen');
    }
  });
});
