import type { Panel } from '@agent-monitor/shared';
import { query } from '../clickhouse/client.js';
import {
  statPanel,
  singleSeriesPanel,
  barPanel,
  tablePanel,
} from './helpers.js';

export async function getErrorBreakdownPanels(workspaceId: string): Promise<Panel[]> {
  const results = await Promise.allSettled([
    totalErrors24h(workspaceId),
    errorRateOverall(workspaceId),
    errorBudgetRemaining(workspaceId),
    mostCommonError(workspaceId),
    errorRateTrend(workspaceId),
    errorsByType(workspaceId),
    errorsByAgent(workspaceId),
    topErrorMessages(workspaceId),
  ]);

  const ids = [
    'total_errors_24h', 'error_rate_overall', 'error_budget_remaining', 'most_common_error',
    'error_rate_trend', 'errors_by_type', 'errors_by_agent', 'top_error_messages',
  ];

  return results.map((r, i) => {
    if (r.status === 'fulfilled') return r.value;
    return errorPanel(ids[i]!, String((r as PromiseRejectedResult).reason));
  });
}

// ---------------------------------------------------------------------------
// Individual panel queries
// ---------------------------------------------------------------------------

async function totalErrors24h(wsId: string): Promise<Panel> {
  const rows = await query<{ cnt: string }>(
    `SELECT count() AS cnt
     FROM agent_errors
     WHERE workspace_id = {workspace_id: String}
       AND timestamp > now() - INTERVAL 24 HOUR`,
    { workspace_id: wsId },
  );
  return statPanel('total_errors_24h', 'Total Errors (24h)', 'short', rows[0]?.cnt ?? '0');
}

async function errorRateOverall(wsId: string): Promise<Panel> {
  const rows = await query<{ rate: string }>(
    `SELECT if(count() = 0, 0, countIf(status IN ('failure', 'timeout')) * 100.0 / count()) AS rate
     FROM agent_executions
     WHERE workspace_id = {workspace_id: String}
       AND timestamp > now() - INTERVAL 1 HOUR`,
    { workspace_id: wsId },
  );
  return statPanel('error_rate_overall', 'Error Rate (1h)', 'percent', rows[0]?.rate ?? '0');
}

async function errorBudgetRemaining(wsId: string): Promise<Panel> {
  // Error budget: assume 1% SLO target over 30 days
  const rows = await query<{ rate: string }>(
    `SELECT if(count() = 0, 0, countIf(status IN ('failure', 'timeout')) * 100.0 / count()) AS rate
     FROM agent_executions
     WHERE workspace_id = {workspace_id: String}
       AND timestamp > now() - INTERVAL 30 DAY`,
    { workspace_id: wsId },
  );
  const errorRate = parseFloat(rows[0]?.rate ?? '0');
  const sloTarget = 1.0; // 1% error budget
  const remaining = Math.max(0, ((sloTarget - errorRate) / sloTarget) * 100);
  return statPanel('error_budget_remaining', 'Error Budget Remaining', 'percent', remaining.toFixed(1));
}

async function mostCommonError(wsId: string): Promise<Panel> {
  const rows = await query<{ error_type: string; cnt: string }>(
    `SELECT error_type, count() AS cnt
     FROM agent_errors
     WHERE workspace_id = {workspace_id: String}
       AND timestamp > now() - INTERVAL 24 HOUR
     GROUP BY error_type
     ORDER BY cnt DESC
     LIMIT 1`,
    { workspace_id: wsId },
  );
  const typ = rows[0]?.error_type ?? 'none';
  const cnt = rows[0]?.cnt ?? '0';
  return statPanel('most_common_error', 'Most Common Error', 'short', cnt, {
    displayValue: typ,
    subtitle: `${cnt} occurrences`,
  });
}

async function errorRateTrend(wsId: string): Promise<Panel> {
  const rows = await query<{ ts: string; value: string }>(
    `SELECT toStartOfFiveMinutes(timestamp) AS ts,
            if(count() = 0, 0, countIf(status IN ('failure', 'timeout')) * 100.0 / count()) AS value
     FROM agent_executions
     WHERE workspace_id = {workspace_id: String}
       AND timestamp > now() - INTERVAL 6 HOUR
     GROUP BY ts
     ORDER BY ts`,
    { workspace_id: wsId },
  );
  return singleSeriesPanel('error_rate_trend', 'Error Rate Trend', 'percent', rows, 'ts', 'value');
}

async function errorsByType(wsId: string): Promise<Panel> {
  const rows = await query<{ error_type: string; value: string }>(
    `SELECT error_type, count() AS value
     FROM agent_errors
     WHERE workspace_id = {workspace_id: String}
       AND timestamp > now() - INTERVAL 24 HOUR
     GROUP BY error_type
     ORDER BY value DESC`,
    { workspace_id: wsId },
  );
  return barPanel('errors_by_type', 'Errors by Type (24h)', 'short', rows, 'error_type', 'value');
}

async function errorsByAgent(wsId: string): Promise<Panel> {
  const rows = await query<{ agent_name: string; value: string }>(
    `SELECT agent_name, count() AS value
     FROM agent_errors
     WHERE workspace_id = {workspace_id: String}
       AND timestamp > now() - INTERVAL 24 HOUR
     GROUP BY agent_name
     ORDER BY value DESC`,
    { workspace_id: wsId },
  );
  return barPanel('errors_by_agent', 'Errors by Agent (24h)', 'short', rows, 'agent_name', 'value');
}

async function topErrorMessages(wsId: string): Promise<Panel> {
  const rows = await query<{
    error_message: string; error_type: string; count: string;
    first_seen: string; last_seen: string;
  }>(
    `SELECT error_message,
            error_type,
            count() AS count,
            min(timestamp) AS first_seen,
            max(timestamp) AS last_seen
     FROM agent_errors
     WHERE workspace_id = {workspace_id: String}
       AND timestamp > now() - INTERVAL 24 HOUR
     GROUP BY error_message, error_type
     ORDER BY count DESC
     LIMIT 20`,
    { workspace_id: wsId },
  );
  return tablePanel('top_error_messages', 'Top Error Messages (24h)', 'short', rows, 'count');
}

// ---------------------------------------------------------------------------
function errorPanel(id: string, message: string): Panel {
  return {
    id, title: id, type: 'stat', unit: 'short',
    data: { resultType: 'vector', result: [] },
    subtitle: `Error: ${message}`, subtitleColor: 'danger',
  };
}
