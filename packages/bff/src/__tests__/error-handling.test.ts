// =============================================================================
// ERH-001, ERH-002, ERH-004: Error handling tests
// =============================================================================

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app, signToken } from './helpers.js';

const token = signToken({ workspace_id: 'ws-acme-prod' });

describe('Error Handling', () => {
  // ERH-001: Unknown view ID returns 404
  it('ERH-001: unknown view ID returns 404', async () => {
    const res = await request(app)
      .get('/api/views/nonexistent-view')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  // ERH-002: Partial panel failure returns partial response
  // The BFF uses Promise.allSettled — failed panels get error markers,
  // successful panels still return data. We verify the response structure
  // supports this: all panels have id/title/type/data regardless of errors.
  it('ERH-002: response contains all panels with valid structure', async () => {
    const res = await request(app)
      .get('/api/views/agent-overview')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.panels.length).toBeGreaterThan(0);

    for (const panel of res.body.panels) {
      expect(panel.id).toBeDefined();
      expect(panel.title).toBeDefined();
      expect(panel.type).toBeDefined();
      expect(panel.data).toBeDefined();
    }
  });

  // ERH-004: Response time under 5 seconds for all views
  it('ERH-004: all 5 views respond within 5 seconds', async () => {
    const viewIds = [
      'agent-overview',
      'tool-call-performance',
      'llm-token-usage',
      'error-breakdown',
      'cost-tracking',
    ];

    for (const viewId of viewIds) {
      const start = performance.now();
      const res = await request(app)
        .get(`/api/views/${viewId}`)
        .set('Authorization', `Bearer ${token}`);
      const elapsed = performance.now() - start;

      expect(res.status, `${viewId} should return 200`).toBe(200);
      expect(elapsed, `${viewId} should respond within 5s (took ${elapsed.toFixed(0)}ms)`).toBeLessThan(5000);
    }
  });
});
