// =============================================================================
// LLM-001..005: LLM Token Usage view tests
// =============================================================================

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app, signToken, getPanel, getStatValue } from './helpers.js';

const token = signToken({ workspace_id: 'ws-acme-prod' });

describe('LLM Token Usage View', () => {
  let body: any;

  it('fetch llm-token-usage', async () => {
    const res = await request(app)
      .get('/api/views/llm-token-usage')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    body = res.body;
  });

  // LLM-001: Returns all expected panels
  it('LLM-001: returns all expected panel IDs', () => {
    const ids = body.panels.map((p: any) => p.id);
    expect(ids).toContain('total_tokens_24h');
    expect(ids).toContain('token_rate');
    expect(ids).toContain('estimated_cost_24h');
    expect(ids).toContain('avg_tokens_per_invocation');
    expect(ids).toContain('token_rate_by_model');
    expect(ids).toContain('prompt_vs_completion');
    expect(ids).toContain('cost_by_model');
    expect(ids).toContain('top_token_consumers');
  });

  // LLM-002: tokens_by_model series match seeded models
  it('LLM-002: token_rate_by_model series include seeded models', () => {
    const panel = getPanel(body, 'token_rate_by_model');
    expect(panel.type).toBe('timeseries');
    const models = panel.data.result.map((s: any) => s.metric.model);
    // Seed data includes these models
    expect(models.some((m: string) => m.includes('claude'))).toBe(true);
    expect(models.some((m: string) => m.includes('gpt'))).toBe(true);
  });

  // LLM-003: prompt_vs_completion has exactly 2 series
  it('LLM-003: prompt_vs_completion has input and output series', () => {
    const panel = getPanel(body, 'prompt_vs_completion');
    expect(panel.type).toBe('timeseries');
    expect(panel.data.result).toHaveLength(2);
    const labels = panel.data.result.map((s: any) => s.metric.token_type);
    expect(labels).toContain('input');
    expect(labels).toContain('output');
  });

  // LLM-004: estimated_cost is positive
  it('LLM-004: estimated_cost is positive for workspace with data', () => {
    const cost = getStatValue(getPanel(body, 'estimated_cost_24h'));
    expect(cost).toBeGreaterThan(0);
  });

  // LLM-005: top_token_consumers table has agent names
  it('LLM-005: top_token_consumers has agent_name and total_tokens', () => {
    const panel = getPanel(body, 'top_token_consumers');
    expect(panel.type).toBe('table');
    if (panel.data.result.length > 0) {
      const metric = panel.data.result[0].metric;
      expect(metric).toHaveProperty('agent_name');
      expect(metric).toHaveProperty('total_tokens');
    }
  });
});
