// =============================================================================
// VIEW-001..003: BFF API View List tests
// =============================================================================

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app, signToken } from './helpers.js';

const token = signToken({ workspace_id: 'ws-acme-prod' });

describe('View List', () => {
  // VIEW-001: List returns 5 views
  it('VIEW-001: list returns 5 views', async () => {
    const res = await request(app)
      .get('/api/views')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(5);
  });

  // VIEW-002: Each view has id, title, description
  it('VIEW-002: each view has id, title, description', async () => {
    const res = await request(app)
      .get('/api/views')
      .set('Authorization', `Bearer ${token}`);
    for (const view of res.body) {
      expect(typeof view.id).toBe('string');
      expect(view.id.length).toBeGreaterThan(0);
      expect(typeof view.title).toBe('string');
      expect(view.title.length).toBeGreaterThan(0);
      expect(typeof view.description).toBe('string');
      expect(view.description.length).toBeGreaterThan(0);
    }
  });

  // VIEW-003: View IDs match expected set
  it('VIEW-003: view IDs match expected set', async () => {
    const res = await request(app)
      .get('/api/views')
      .set('Authorization', `Bearer ${token}`);
    const ids = res.body.map((v: { id: string }) => v.id).sort();
    expect(ids).toEqual([
      'agent-overview',
      'cost-tracking',
      'error-breakdown',
      'llm-token-usage',
      'tool-call-performance',
    ]);
  });
});
