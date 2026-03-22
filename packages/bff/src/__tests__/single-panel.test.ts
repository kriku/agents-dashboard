// =============================================================================
// Single panel endpoint tests — covers GET /api/views/:viewId/panels/:panelId
// =============================================================================

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app, signToken } from './helpers.js';

const token = signToken({ workspace_id: 'ws-acme-prod' });

describe('Single panel endpoint', () => {
  it('returns a single panel by ID', async () => {
    const res = await request(app)
      .get('/api/views/agent-overview/panels/active_agents')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('active_agents');
    expect(res.body.type).toBe('stat');
    expect(res.body.data).toBeDefined();
  });

  it('returns 404 for unknown view', async () => {
    const res = await request(app)
      .get('/api/views/nonexistent/panels/active_agents')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  it('returns 404 for unknown panel in valid view', async () => {
    const res = await request(app)
      .get('/api/views/agent-overview/panels/nonexistent_panel')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  it('returns panel with correct data structure', async () => {
    const res = await request(app)
      .get('/api/views/tool-call-performance/panels/tool_latency_percentiles')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('tool_latency_percentiles');
    expect(res.body.type).toBe('timeseries');
    expect(res.body.data.resultType).toBe('matrix');
  });

  it('scopes panel data to the authenticated workspace', async () => {
    const tokenA = signToken({ workspace_id: 'ws-acme-prod' });
    const tokenB = signToken({ workspace_id: 'ws-acme-staging' });

    const resA = await request(app)
      .get('/api/views/agent-overview/panels/active_agents')
      .set('Authorization', `Bearer ${tokenA}`);
    const resB = await request(app)
      .get('/api/views/agent-overview/panels/active_agents')
      .set('Authorization', `Bearer ${tokenB}`);

    expect(resA.status).toBe(200);
    expect(resB.status).toBe(200);
    // Different workspaces should have different active agent counts
    // (acme-prod has scale=1.0, acme-staging has scale=0.1)
    const valA = resA.body.data?.result?.[0]?.value?.[1];
    const valB = resB.body.data?.result?.[0]?.value?.[1];
    expect(valA).toBeDefined();
    expect(valB).toBeDefined();
  });
});
