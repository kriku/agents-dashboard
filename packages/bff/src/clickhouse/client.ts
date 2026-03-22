import { createClient } from '@clickhouse/client';
import { config } from '../config.js';
import { logger } from '../logger.js';

export const ch = createClient({
  url: config.clickhouse.url,
  database: config.clickhouse.database,
  username: config.clickhouse.username,
  password: config.clickhouse.password,
  clickhouse_settings: {
    date_time_input_format: 'best_effort',
  },
});

export async function query<T>(
  sql: string,
  params: Record<string, unknown>,
): Promise<T[]> {
  const start = performance.now();
  const result = await ch.query({
    query: sql,
    query_params: params,
    format: 'JSONEachRow',
  });
  const rows = await result.json<T>();
  const durationMs = (performance.now() - start).toFixed(1);
  logger.debug({ durationMs, rowCount: rows.length }, 'clickhouse query');
  return rows;
}

export async function ping(): Promise<boolean> {
  try {
    await ch.query({ query: 'SELECT 1', format: 'JSONEachRow' });
    return true;
  } catch {
    return false;
  }
}
