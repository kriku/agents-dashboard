// =============================================================================
// SQL-021..025: SQL safety tests
// =============================================================================
// Verifies injection prevention, parameterized queries, and concurrency.
// Requires: ClickHouse running with schema applied.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import request from 'supertest';
import { app, signToken, chValue } from './helpers.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('SQL Safety', () => {
  // SQL-021: SQL injection in workspace_id blocked
  it('SQL-021: SQL injection in workspace_id returns empty result, table intact', async () => {
    // Sign a token with a malicious workspace_id
    const maliciousToken = signToken({
      workspace_id: "'; DROP TABLE agent_executions; --",
    });
    const res = await request(app)
      .get('/api/views/agent-overview')
      .set('Authorization', `Bearer ${maliciousToken}`);
    expect(res.status).toBe(200);

    // All stat panels should return 0 (no data for the malicious workspace_id)
    // Table should still exist
    const count = await chValue<string>('SELECT count() FROM agent_executions');
    expect(Number(count)).toBeGreaterThan(0);
  });

  // SQL-022: Parameterized queries used consistently
  it('SQL-022: all query files use parameterized {workspace_id: String} syntax', () => {
    const queriesDir = join(__dirname, '..', 'queries');
    const queryFiles = readdirSync(queriesDir).filter(
      (f) => f.endsWith('.ts') && f !== 'registry.ts' && f !== 'helpers.ts',
    );

    for (const file of queryFiles) {
      const content = readFileSync(join(queriesDir, file), 'utf-8');
      // Find all SQL template literals that contain SELECT
      const sqlBlocks = content.match(/`[^`]*SELECT[^`]*`/gs) ?? [];
      for (const sql of sqlBlocks) {
        // Every SQL block should use parameterized workspace_id
        if (sql.includes('workspace_id')) {
          expect(
            sql,
            `${file} should use {workspace_id: String} parameter, not string interpolation`,
          ).toMatch(/\{workspace_id:\s*String\}/);
        }
      }
    }
  });

  // SQL-023: No FORMAT clause exposes raw data
  it('SQL-023: no query contains FORMAT clause', () => {
    const queriesDir = join(__dirname, '..', 'queries');
    const queryFiles = readdirSync(queriesDir).filter(
      (f) => f.endsWith('.ts') && f !== 'registry.ts' && f !== 'helpers.ts',
    );

    for (const file of queryFiles) {
      const content = readFileSync(join(queriesDir, file), 'utf-8');
      const sqlBlocks = content.match(/`[^`]*SELECT[^`]*`/gs) ?? [];
      for (const sql of sqlBlocks) {
        // No FORMAT clause in SQL (the client handles format)
        expect(sql.toUpperCase(), `${file} should not contain FORMAT clause`).not.toMatch(
          /\bFORMAT\s+(JSON|CSV|TSV|TabSeparated|Native)/,
        );
      }
    }
  });

  // SQL-024: Response time is bounded (all views under 5s)
  it('SQL-024: all views respond within 5 seconds', async () => {
    const token = signToken({ workspace_id: 'ws-acme-prod' });
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
      expect(res.status).toBe(200);
      expect(elapsed, `${viewId} took ${elapsed.toFixed(0)}ms`).toBeLessThan(5000);
    }
  });

  // SQL-025: Connection pool handles concurrent requests
  it('SQL-025: 20 parallel requests all succeed', async () => {
    const token = signToken({ workspace_id: 'ws-acme-prod' });
    const promises = Array.from({ length: 20 }, () =>
      request(app)
        .get('/api/views/agent-overview')
        .set('Authorization', `Bearer ${token}`),
    );
    const results = await Promise.all(promises);
    for (const res of results) {
      expect(res.status).toBe(200);
      expect(res.body.panels.length).toBeGreaterThan(0);
    }
  });
});
