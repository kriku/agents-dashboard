// =============================================================================
// TI-009..011: Seed data verification tests
// =============================================================================
// Validates that generated seed data meets expectations:
// - 5 distinct workspaces with proportional volumes
// - No empty workspace_id rows
// - Correct org-workspace mapping in dimension table
//
// Requires: ClickHouse running with seeded data (pnpm run generate)
// Run: pnpm --filter @agent-monitor/clickhouse test
// =============================================================================

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, type ClickHouseClient } from '@clickhouse/client';

let client: ClickHouseClient;

beforeAll(() => {
  client = createClient({
    url: process.env.CLICKHOUSE_URL || 'http://localhost:8123',
    database: process.env.CLICKHOUSE_DB || 'agent_monitor',
    username: process.env.CLICKHOUSE_USER || 'default',
    password: process.env.CLICKHOUSE_PASSWORD || '',
  });
});

afterAll(async () => {
  await client.close();
});

async function queryRows<T>(sql: string): Promise<T[]> {
  const result = await client.query({ query: sql, format: 'JSONEachRow' });
  return result.json<T>();
}

async function queryValue<T>(sql: string): Promise<T> {
  const rows = await queryRows<Record<string, T>>(sql);
  return Object.values(rows[0]!)[0]!;
}

// TI-009: Each workspace has distinct data volume
describe('TI-009: workspace data volumes', () => {
  it('has 5 distinct workspaces in agent_executions', async () => {
    const count = await queryValue<string>(
      'SELECT count(DISTINCT workspace_id) FROM agent_executions',
    );
    expect(Number(count)).toBe(5);
  });

  it('ws-acme-prod has ~50K+ rows (heavy workspace)', async () => {
    const count = await queryValue<string>(
      "SELECT count() FROM agent_executions WHERE workspace_id = 'ws-acme-prod'",
    );
    expect(Number(count)).toBeGreaterThan(40_000);
  });

  it('ws-acme-staging has ~5K rows (light workspace)', async () => {
    const count = await queryValue<string>(
      "SELECT count() FROM agent_executions WHERE workspace_id = 'ws-acme-staging'",
    );
    const n = Number(count);
    expect(n).toBeGreaterThan(3_000);
    expect(n).toBeLessThan(15_000);
  });

  it('medium workspaces have proportional volumes (~30% of heavy)', async () => {
    const heavy = Number(
      await queryValue<string>(
        "SELECT count() FROM agent_executions WHERE workspace_id = 'ws-acme-prod'",
      ),
    );
    const medium = Number(
      await queryValue<string>(
        "SELECT count() FROM agent_executions WHERE workspace_id = 'ws-globex-main'",
      ),
    );
    const ratio = medium / heavy;
    expect(ratio).toBeGreaterThan(0.15);
    expect(ratio).toBeLessThan(0.50);
  });

  it('all 6 tables have data', async () => {
    const tables = [
      'agent_executions',
      'tool_calls',
      'llm_requests',
      'agent_errors',
      'guardrail_validations',
      'workspaces',
    ];
    for (const table of tables) {
      const count = Number(await queryValue<string>(`SELECT count() FROM ${table}`));
      expect(count, `${table} should have data`).toBeGreaterThan(0);
    }
  });

  it('data spans 30 days', async () => {
    const days = await queryValue<string>(
      "SELECT dateDiff('day', min(timestamp), max(timestamp)) FROM agent_executions",
    );
    expect(Number(days)).toBeGreaterThanOrEqual(29);
  });

  it('code-reviewer has highest error rate (~8%)', async () => {
    type Row = { agent_name: string; err_pct: string };
    const rows = await queryRows<Row>(
      `SELECT agent_name,
              countIf(status IN ('failure', 'timeout')) * 100.0 / count() as err_pct
       FROM agent_executions
       WHERE workspace_id = 'ws-acme-prod'
       GROUP BY agent_name
       ORDER BY err_pct DESC`,
    );
    expect(rows[0]!.agent_name).toBe('code-reviewer');
    expect(Number(rows[0]!.err_pct)).toBeGreaterThan(6);
  });
});

// TI-010: No rows with null/empty workspace_id
describe('TI-010: no empty workspace_id', () => {
  const tables = ['agent_executions', 'tool_calls', 'llm_requests', 'agent_errors', 'guardrail_validations'];

  for (const table of tables) {
    it(`${table} has zero rows with empty workspace_id`, async () => {
      const count = await queryValue<string>(
        `SELECT count() FROM ${table} WHERE workspace_id = ''`,
      );
      expect(Number(count)).toBe(0);
    });
  }
});

// TI-011: Org-workspace mapping correct
describe('TI-011: org-workspace mapping', () => {
  it('ws-acme-prod and ws-acme-staging belong to org-acme', async () => {
    type Row = { workspace_id: string; org_id: string };
    const rows = await queryRows<Row>(
      "SELECT workspace_id, org_id FROM workspaces WHERE org_id = 'org-acme' ORDER BY workspace_id",
    );
    const wsIds = rows.map((r) => r.workspace_id);
    expect(wsIds).toContain('ws-acme-prod');
    expect(wsIds).toContain('ws-acme-staging');
    expect(rows.every((r) => r.org_id === 'org-acme')).toBe(true);
  });

  it('ws-initech-prod belongs to org-initech', async () => {
    type Row = { org_id: string };
    const rows = await queryRows<Row>(
      "SELECT org_id FROM workspaces WHERE workspace_id = 'ws-initech-prod'",
    );
    expect(rows[0]!.org_id).toBe('org-initech');
  });

  it('ws-globex-main belongs to org-globex', async () => {
    type Row = { org_id: string };
    const rows = await queryRows<Row>(
      "SELECT org_id FROM workspaces WHERE workspace_id = 'ws-globex-main'",
    );
    expect(rows[0]!.org_id).toBe('org-globex');
  });

  it('has exactly 5 workspace records', async () => {
    const count = await queryValue<string>('SELECT count() FROM workspaces');
    expect(Number(count)).toBe(5);
  });
});
