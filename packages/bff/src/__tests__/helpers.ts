import jwt from 'jsonwebtoken';
import { createClient } from '@clickhouse/client';
import type { JwtPayload } from '../middleware/auth.js';
import { createApp } from '../app.js';

// ---------------------------------------------------------------------------
// Express app (shared across test files via module cache)
// ---------------------------------------------------------------------------

export const app = createApp();

// ---------------------------------------------------------------------------
// JWT helpers
// ---------------------------------------------------------------------------

export const JWT_SECRET = 'dev-secret';

const WORKSPACE_ORG: Record<string, string> = {
  'ws-acme-prod': 'org-acme',
  'ws-acme-staging': 'org-acme',
  'ws-globex-main': 'org-globex',
  'ws-initech-prod': 'org-initech',
  'ws-initech-research': 'org-initech',
};

export function signToken(
  overrides: Partial<JwtPayload> & Pick<JwtPayload, 'workspace_id'>,
  opts?: { expiresIn?: string | number; secret?: string },
): string {
  const orgId = overrides.org_id ?? WORKSPACE_ORG[overrides.workspace_id] ?? 'org-test';
  const payload: JwtPayload = {
    sub: overrides.sub ?? 'user-test',
    org_id: orgId,
    workspace_id: overrides.workspace_id,
    workspace_name: overrides.workspace_name ?? 'Test',
    org_name: overrides.org_name ?? 'Test Org',
    role: overrides.role ?? 'admin',
  };
  return jwt.sign(payload, opts?.secret ?? JWT_SECRET, {
    expiresIn: opts?.expiresIn ?? '1h',
  } as jwt.SignOptions);
}

// ---------------------------------------------------------------------------
// ClickHouse test client
// ---------------------------------------------------------------------------

export const testCh = createClient({
  url: process.env.CLICKHOUSE_URL || 'http://localhost:8123',
  database: process.env.CLICKHOUSE_DB || 'agent_monitor',
  username: process.env.CLICKHOUSE_USER || 'default',
  password: process.env.CLICKHOUSE_PASSWORD || '',
  clickhouse_settings: {
    date_time_input_format: 'best_effort',
  },
});

export async function chQuery<T>(sql: string, params?: Record<string, unknown>): Promise<T[]> {
  const result = await testCh.query({
    query: sql,
    query_params: params,
    format: 'JSONEachRow',
  });
  return result.json<T>();
}

export async function chExec(sql: string): Promise<void> {
  await testCh.command({ query: sql });
}

export async function chInsert(table: string, values: Record<string, unknown>[]): Promise<void> {
  if (values.length === 0) return;
  await testCh.insert({ table, values, format: 'JSONEachRow' });
}

export async function chValue<T>(sql: string): Promise<T> {
  const rows = await chQuery<Record<string, T>>(sql);
  return Object.values(rows[0]!)[0]!;
}

/** Delete all data for a workspace from all tables (for test cleanup) */
export async function cleanWorkspace(workspaceId: string): Promise<void> {
  const tables = ['agent_executions', 'tool_calls', 'llm_requests', 'agent_errors', 'guardrail_validations'];
  for (const table of tables) {
    await chExec(`ALTER TABLE ${table} DELETE WHERE workspace_id = '${workspaceId}'`);
  }
  await new Promise((r) => setTimeout(r, 1000));
}

// ---------------------------------------------------------------------------
// Panel helpers for assertions
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getPanel(body: any, panelId: string): any {
  return body.panels.find((p: any) => p.id === panelId);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getStatValue(panel: any): number {
  return parseFloat(panel?.data?.result?.[0]?.value?.[1] ?? '0');
}
