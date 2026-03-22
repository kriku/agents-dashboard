// =============================================================================
// Health and readiness endpoint tests
// Covers uncovered lines in app.ts (health/ready routes) and clickhouse/client.ts (ping)
// =============================================================================

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from './helpers.js';

describe('Health and readiness', () => {
  it('GET /api/health returns 200 OK', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('GET /api/ready returns 200 when ClickHouse is reachable', async () => {
    const res = await request(app).get('/api/ready');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ready');
  });

  it('health endpoint does not require authentication', async () => {
    const res = await request(app).get('/api/health');
    // No Authorization header — should still succeed
    expect(res.status).toBe(200);
  });

  it('ready endpoint does not require authentication', async () => {
    const res = await request(app).get('/api/ready');
    expect(res.status).toBe(200);
  });
});
