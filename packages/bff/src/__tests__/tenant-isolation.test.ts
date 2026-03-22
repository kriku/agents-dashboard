// =============================================================================
// TI-001..008: Tenant isolation tests (BFF-level + static analysis)
// =============================================================================

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import request from 'supertest';
import { app, signToken, getPanel, getStatValue } from './helpers.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// TI-001..005: HTTP-level tenant isolation
// ---------------------------------------------------------------------------

describe('Tenant Isolation (HTTP)', () => {
  const acmeToken = signToken({ workspace_id: 'ws-acme-prod' });
  const globexToken = signToken({ workspace_id: 'ws-globex-main' });
  const stagingToken = signToken({ workspace_id: 'ws-acme-staging' });

  // TI-001: Query as workspace A returns only workspace A data
  it('TI-001: ws-acme-prod returns data scoped to that workspace', async () => {
    const res = await request(app)
      .get('/api/views/agent-overview')
      .set('Authorization', `Bearer ${acmeToken}`);
    expect(res.status).toBe(200);
    expect(res.body.panels.length).toBeGreaterThan(0);
    // active_agents stat panel should have data (heavy workspace)
    const panel = getPanel(res.body, 'active_agents');
    expect(panel).toBeDefined();
    expect(panel.data.resultType).toBe('vector');
  });

  // TI-002: Query as workspace B returns different data
  it('TI-002: ws-globex-main returns different data than ws-acme-prod', async () => {
    const [acmeRes, globexRes] = await Promise.all([
      request(app)
        .get('/api/views/agent-overview')
        .set('Authorization', `Bearer ${acmeToken}`),
      request(app)
        .get('/api/views/agent-overview')
        .set('Authorization', `Bearer ${globexToken}`),
    ]);

    const acmeTotal = getStatValue(getPanel(acmeRes.body, 'total_invocations_24h'));
    const globexTotal = getStatValue(getPanel(globexRes.body, 'total_invocations_24h'));

    // Different workspaces should have different data volumes
    // (ws-acme-prod is 1.0 scale, ws-globex-main is 0.3 scale)
    expect(acmeTotal).not.toBe(globexTotal);
  });

  // TI-003: Workspace switching changes all panels
  it('TI-003: ws-acme-prod and ws-acme-staging return different stats', async () => {
    const [prodRes, stagingRes] = await Promise.all([
      request(app)
        .get('/api/views/agent-overview')
        .set('Authorization', `Bearer ${acmeToken}`),
      request(app)
        .get('/api/views/agent-overview')
        .set('Authorization', `Bearer ${stagingToken}`),
    ]);

    const prodTotal = getStatValue(getPanel(prodRes.body, 'total_invocations_24h'));
    const stagingTotal = getStatValue(getPanel(stagingRes.body, 'total_invocations_24h'));

    // prod (1.0 scale) should have more data than staging (0.1 scale)
    expect(prodTotal).toBeGreaterThan(stagingTotal);
  });

  // TI-004: Org boundary enforced — workspaces endpoint only returns same-org workspaces
  it('TI-004: org boundary enforced on workspaces endpoint', async () => {
    const res = await request(app)
      .get('/api/workspaces')
      .set('Authorization', `Bearer ${acmeToken}`);
    expect(res.status).toBe(200);

    const wsIds = res.body.map((w: { workspace_id: string }) => w.workspace_id);
    // Should contain acme workspaces
    expect(wsIds).toContain('ws-acme-prod');
    expect(wsIds).toContain('ws-acme-staging');
    // Should NOT contain other org workspaces
    expect(wsIds).not.toContain('ws-initech-prod');
    expect(wsIds).not.toContain('ws-globex-main');
  });

  // TI-005: Cannot override workspace via query param
  it('TI-005: workspace_id query param does not override JWT', async () => {
    const [normalRes, overrideRes] = await Promise.all([
      request(app)
        .get('/api/views/agent-overview')
        .set('Authorization', `Bearer ${acmeToken}`),
      request(app)
        .get('/api/views/agent-overview?workspace_id=ws-globex-main')
        .set('Authorization', `Bearer ${acmeToken}`),
    ]);

    // Both should return the same data (JWT workspace, not query param)
    const normalTotal = getStatValue(getPanel(normalRes.body, 'total_invocations_24h'));
    const overrideTotal = getStatValue(getPanel(overrideRes.body, 'total_invocations_24h'));
    expect(normalTotal).toBe(overrideTotal);
  });
});

// ---------------------------------------------------------------------------
// TI-006..008: Static analysis of query files
// ---------------------------------------------------------------------------

describe('Tenant Isolation (Static Analysis)', () => {
  const queriesDir = join(__dirname, '..', 'queries');
  const queryFiles = readdirSync(queriesDir)
    .filter((f) => f.endsWith('.ts') && f !== 'registry.ts' && f !== 'helpers.ts');

  // TI-006: Every SQL query includes workspace_id parameter
  it('TI-006: every query file uses parameterized workspace_id', () => {
    for (const file of queryFiles) {
      const content = readFileSync(join(queriesDir, file), 'utf-8');
      // Every file that queries ClickHouse should use the parameterized workspace_id
      expect(
        content.includes('{workspace_id: String}') || content.includes('{workspace_id:String}'),
        `${file} should use parameterized workspace_id`,
      ).toBe(true);
    }
  });

  // TI-007: No raw string interpolation of workspace_id in SQL
  it('TI-007: no raw string interpolation of workspace_id', () => {
    for (const file of queryFiles) {
      const content = readFileSync(join(queriesDir, file), 'utf-8');
      // Should not have ${workspace_id} or ${wsId} in SQL template literals
      expect(
        content,
        `${file} should not use raw interpolation of workspace_id`,
      ).not.toMatch(/\$\{(?:workspace_id|wsId)\}/);
    }
  });

  // TI-008: No cross-workspace aggregation
  it('TI-008: no query uses GROUP BY workspace_id or omits workspace filter', () => {
    for (const file of queryFiles) {
      const content = readFileSync(join(queriesDir, file), 'utf-8');
      // Extract SQL template literals (between backticks containing SELECT)
      const sqlMatches = content.match(/`[^`]*SELECT[^`]*`/gs) ?? [];
      for (const sql of sqlMatches) {
        // No GROUP BY workspace_id (would aggregate across workspaces)
        expect(sql, `${file} should not GROUP BY workspace_id`).not.toMatch(
          /GROUP\s+BY[^`]*workspace_id/i,
        );
        // Every SELECT should have a workspace_id filter
        expect(
          sql,
          `${file} SQL should filter by workspace_id`,
        ).toMatch(/workspace_id\s*=/);
      }
    }
  });
});
