import type { Panel } from '@agent-monitor/shared';
import { query } from '../clickhouse/client.js';
import {
  statPanel,
  timeseriesPanel,
  barPanel,
  tablePanel,
} from './helpers.js';

export async function getToolPerformancePanels(workspaceId: string): Promise<Panel[]> {
  const results = await Promise.allSettled([
    activeTools(workspaceId),
    totalToolCalls24h(workspaceId),
    toolErrorRateCurrent(workspaceId),
    retryRate(workspaceId),
    toolLatencyPercentiles(workspaceId),
    toolErrorRates(workspaceId),
    retryRateByTool(workspaceId),
    slowestTools(workspaceId),
  ]);

  const ids = [
    'active_tools', 'total_tool_calls_24h', 'tool_error_rate_current', 'retry_rate',
    'tool_latency_percentiles', 'tool_error_rates', 'retry_rate_by_tool', 'slowest_tools',
  ];

  return results.map((r, i) => {
    if (r.status === 'fulfilled') return r.value;
    return errorPanel(ids[i]!, String((r as PromiseRejectedResult).reason));
  });
}

// ---------------------------------------------------------------------------
// Individual panel queries
// ---------------------------------------------------------------------------

async function activeTools(wsId: string): Promise<Panel> {
  const rows = await query<{ cnt: string }>(
    `SELECT count(DISTINCT tool_name) AS cnt
     FROM tool_calls
     WHERE workspace_id = {workspace_id: String}
       AND timestamp > now() - INTERVAL 1 HOUR`,
    { workspace_id: wsId },
  );
  return statPanel('active_tools', 'Active Tools', 'short', rows[0]?.cnt ?? '0');
}

async function totalToolCalls24h(wsId: string): Promise<Panel> {
  const rows = await query<{ cnt: string }>(
    `SELECT count() AS cnt
     FROM tool_calls
     WHERE workspace_id = {workspace_id: String}
       AND timestamp > now() - INTERVAL 24 HOUR`,
    { workspace_id: wsId },
  );
  return statPanel('total_tool_calls_24h', 'Total Tool Calls (24h)', 'short', rows[0]?.cnt ?? '0');
}

async function toolErrorRateCurrent(wsId: string): Promise<Panel> {
  const rows = await query<{ rate: string }>(
    `SELECT if(count() = 0, 0, countIf(status = 'error') * 100.0 / count()) AS rate
     FROM tool_calls
     WHERE workspace_id = {workspace_id: String}
       AND timestamp > now() - INTERVAL 1 HOUR`,
    { workspace_id: wsId },
  );
  return statPanel('tool_error_rate_current', 'Tool Error Rate (1h)', 'percent', rows[0]?.rate ?? '0');
}

async function retryRate(wsId: string): Promise<Panel> {
  const rows = await query<{ rate: string }>(
    `SELECT if(count() = 0, 0, countIf(retry_count > 0) * 100.0 / count()) AS rate
     FROM tool_calls
     WHERE workspace_id = {workspace_id: String}
       AND timestamp > now() - INTERVAL 1 HOUR`,
    { workspace_id: wsId },
  );
  return statPanel('retry_rate', 'Retry Rate (1h)', 'percent', rows[0]?.rate ?? '0');
}

async function toolLatencyPercentiles(wsId: string): Promise<Panel> {
  const rows = await query<{ ts: string; p50: string; p95: string; p99: string }>(
    `SELECT toStartOfFiveMinutes(timestamp) AS ts,
            quantile(0.5)(duration_ms) / 1000.0 AS p50,
            quantile(0.95)(duration_ms) / 1000.0 AS p95,
            quantile(0.99)(duration_ms) / 1000.0 AS p99
     FROM tool_calls
     WHERE workspace_id = {workspace_id: String}
       AND timestamp > now() - INTERVAL 6 HOUR
     GROUP BY ts
     ORDER BY ts`,
    { workspace_id: wsId },
  );

  // Expand into 3 series: p50, p95, p99
  const now = Math.floor(Date.now() / 1000);
  const toValues = (col: 'p50' | 'p95' | 'p99') =>
    rows.map((r): [number, string] => {
      const ts = Date.parse(r.ts);
      return [Number.isNaN(ts) ? now : Math.floor(ts / 1000), String(r[col] ?? '0')];
    });

  const panel: Panel = {
    id: 'tool_latency_percentiles',
    title: 'Tool Latency Percentiles',
    type: 'timeseries',
    unit: 'seconds',
    data: {
      resultType: 'matrix',
      result: [
        { metric: { percentile: 'p50' }, values: toValues('p50') },
        { metric: { percentile: 'p95' }, values: toValues('p95') },
        { metric: { percentile: 'p99' }, values: toValues('p99') },
      ],
    },
  };
  return panel;
}

async function toolErrorRates(wsId: string): Promise<Panel> {
  const rows = await query<{ ts: string; tool_name: string; value: string }>(
    `SELECT toStartOfFiveMinutes(timestamp) AS ts,
            tool_name,
            if(count() = 0, 0, countIf(status = 'error') * 100.0 / count()) AS value
     FROM tool_calls
     WHERE workspace_id = {workspace_id: String}
       AND timestamp > now() - INTERVAL 6 HOUR
     GROUP BY ts, tool_name
     ORDER BY ts`,
    { workspace_id: wsId },
  );
  return timeseriesPanel('tool_error_rates', 'Tool Error Rates', 'percent', rows, 'tool_name', 'ts', 'value');
}

async function retryRateByTool(wsId: string): Promise<Panel> {
  const rows = await query<{ tool_name: string; value: string }>(
    `SELECT tool_name,
            if(count() = 0, 0, countIf(retry_count > 0) * 100.0 / count()) AS value
     FROM tool_calls
     WHERE workspace_id = {workspace_id: String}
       AND timestamp > now() - INTERVAL 24 HOUR
     GROUP BY tool_name
     ORDER BY value DESC`,
    { workspace_id: wsId },
  );
  return barPanel('retry_rate_by_tool', 'Retry Rate by Tool (24h)', 'percent', rows, 'tool_name', 'value');
}

async function slowestTools(wsId: string): Promise<Panel> {
  const rows = await query<{
    tool_name: string; p50_ms: string; p95_ms: string; p99_ms: string;
    call_count: string; error_rate: string;
  }>(
    `SELECT tool_name,
            round(quantile(0.5)(duration_ms), 1) AS p50_ms,
            round(quantile(0.95)(duration_ms), 1) AS p95_ms,
            round(quantile(0.99)(duration_ms), 1) AS p99_ms,
            count() AS call_count,
            round(countIf(status = 'error') * 100.0 / count(), 2) AS error_rate
     FROM tool_calls
     WHERE workspace_id = {workspace_id: String}
       AND timestamp > now() - INTERVAL 24 HOUR
     GROUP BY tool_name
     ORDER BY p95_ms DESC
     LIMIT 10`,
    { workspace_id: wsId },
  );
  return tablePanel('slowest_tools', 'Slowest Tools (24h)', 'seconds', rows, 'call_count');
}

// ---------------------------------------------------------------------------
function errorPanel(id: string, message: string): Panel {
  return {
    id, title: id, type: 'stat', unit: 'short',
    data: { resultType: 'vector', result: [] },
    subtitle: `Error: ${message}`, subtitleColor: 'danger',
  };
}
