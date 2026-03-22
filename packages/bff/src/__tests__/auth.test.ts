// =============================================================================
// AUTH-001..007: BFF API Authentication tests
// =============================================================================

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app, signToken, JWT_SECRET } from './helpers.js';

describe('BFF Authentication', () => {
  // AUTH-001: Valid JWT accepted
  it('AUTH-001: valid JWT returns 200', async () => {
    const token = signToken({ workspace_id: 'ws-acme-prod' });
    const res = await request(app)
      .get('/api/views')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  // AUTH-002: Missing Authorization header → 401
  it('AUTH-002: missing Authorization header returns 401', async () => {
    const res = await request(app).get('/api/views/agent-overview');
    expect(res.status).toBe(401);
  });

  // AUTH-003: Malformed token → 401
  it('AUTH-003: malformed token returns 401', async () => {
    const res = await request(app)
      .get('/api/views/agent-overview')
      .set('Authorization', 'Bearer not-a-jwt-at-all');
    expect(res.status).toBe(401);
  });

  // AUTH-004: Expired JWT → 401
  it('AUTH-004: expired JWT returns 401', async () => {
    const token = signToken({ workspace_id: 'ws-acme-prod' }, { expiresIn: '-1s' });
    const res = await request(app)
      .get('/api/views/agent-overview')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
  });

  // AUTH-005: Wrong signing secret → 401
  it('AUTH-005: wrong signing secret returns 401', async () => {
    const token = signToken({ workspace_id: 'ws-acme-prod' }, { secret: 'wrong-secret' });
    const res = await request(app)
      .get('/api/views/agent-overview')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
  });

  // AUTH-006: Demo token endpoint returns a valid JWT
  it('AUTH-006: demo token endpoint returns valid JWT', async () => {
    const res = await request(app).get('/api/auth/demo-token');
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();

    // Verify the token is cryptographically valid
    const decoded = jwt.verify(res.body.token, JWT_SECRET);
    expect(decoded).toBeDefined();
  });

  // AUTH-007: Token claims contain required fields
  it('AUTH-007: token claims contain sub, org_id, workspace_id, role', async () => {
    const res = await request(app).get('/api/auth/demo-token');
    const decoded = jwt.decode(res.body.token) as Record<string, unknown>;
    expect(decoded.sub).toBeDefined();
    expect(decoded.org_id).toBeDefined();
    expect(decoded.workspace_id).toBeDefined();
    expect(decoded.role).toBeDefined();
  });
});
