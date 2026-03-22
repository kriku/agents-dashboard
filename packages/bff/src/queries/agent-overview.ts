import type { Panel } from '@agent-monitor/shared';
import { query } from '../clickhouse/client.js';
import {
  statPanel,
  timeseriesPanel,
  singleSeriesPanel,
  barPanel,
  heatmapPanel,
} from './helpers.js';

export async function getAgentOverviewPanels(workspaceId: string): Promise<Panel[]> {
  const results = await Promise.allSettled([
    activeAgents(workspaceId),
    totalInvocations24h(workspaceId),
    errorRateCurrent(workspaceId),
    p95LatencyCurrent(workspaceId),
    invocationRate(workspaceId),
    errorRate(workspaceId),
    errorsByType(workspaceId),
    p95Latency(workspaceId),
    stepDistribution(workspaceId),
    guardrailPassFail(workspaceId),
  ]);

  return results.map((r, i) => {
    if (r.status === 'fulfilled') return r.value;
    const ids = [
      'active_agents', 'total_invocations_24h', 'error_rate_current',
      'p95_latency_current', 'invocation_rate', 'error_rate',
      'errors_by_type', 'p95_latency', 'step_distribution', 'guardrail_pass_fail',
    ];
    return errorPanel(ids[i]!, String((r as PromiseRejectedResult).reason));
  });
}

// ---------------------------------------------------------------------------
// Individual panel queries
// ---------------------------------------------------------------------------

async function activeAgents(wsId: string): Promise<Panel> {
  const rows = await query<{ cnt: string }>(
    `SELECT count(DISTINCT agent_name) AS cnt
     FROM agent_executions
     WHERE workspace_id = {workspace_id: String}
       AND timestamp > now() - INTERVAL 5 MINUTE`,
    { workspace_id: wsId },
  );
  return statPanel('active_agents', 'Active Agents', 'short', rows[0]?.cnt ?? '0');
}

async function totalInvocations24h(wsId: string): Promise<Panel> {
  const rows = await query<{ cnt: string }>(
    `SELECT count() AS cnt
     FROM agent_executions
     WHERE workspace_id = {workspace_id: String}
       AND timestamp > now() - INTERVAL 24 HOUR`,
    { workspace_id: wsId },
  );
  return statPanel('total_invocations_24h', 'Total Invocations (24h)', 'short', rows[0]?.cnt ?? '0');
}

async function errorRateCurrent(wsId: string): Promise<Panel> {
  const rows = await query<{ rate: string }>(
    `SELECT if(count() = 0, 0, countIf(status IN ('failure', 'timeout')) * 100.0 / count()) AS rate
     FROM agent_executions
     WHERE workspace_id = {workspace_id: String}
       AND timestamp > now() - INTERVAL 1 HOUR`,
    { workspace_id: wsId },
  );
  return statPanel('error_rate_current', 'Error Rate (1h)', 'percent', rows[0]?.rate ?? '0');
}

async function p95LatencyCurrent(wsId: string): Promise<Panel> {
  const rows = await query<{ p95: string }>(
    `SELECT quantile(0.95)(duration_ms) / 1000.0 AS p95
     FROM agent_executions
     WHERE workspace_id = {workspace_id: String}
       AND timestamp > now() - INTERVAL 1 HOUR`,
    { workspace_id: wsId },
  );
  return statPanel('p95_latency_current', 'P95 Latency (1h)', 'seconds', rows[0]?.p95 ?? '0');
}

async function invocationRate(wsId: string): Promise<Panel> {
  const rows = await query<{ ts: string; agent_name: string; value: string }>(
    `SELECT toStartOfFiveMinutes(timestamp) AS ts,
            agent_name,
            count() AS value
     FROM agent_executions
     WHERE workspace_id = {workspace_id: String}
       AND timestamp > now() - INTERVAL 6 HOUR
     GROUP BY ts, agent_name
     ORDER BY ts`,
    { workspace_id: wsId },
  );
  return timeseriesPanel('invocation_rate', 'Invocation Rate', 'reqps', rows, 'agent_name', 'ts', 'value');
}

async function errorRate(wsId: string): Promise<Panel> {
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
  return singleSeriesPanel('error_rate', 'Error Rate', 'percent', rows, 'ts', 'value');
}

async function errorsByType(wsId: string): Promise<Panel> {
  const rows = await query<{ error_type: string; value: string }>(
    `SELECT error_type, count() AS value
     FROM agent_errors
     WHERE workspace_id = {workspace_id: String}
       AND timestamp > now() - INTERVAL 24 HOUR
     GROUP BY error_type
     ORDER BY value DESC
     LIMIT 10`,
    { workspace_id: wsId },
  );
  return barPanel('errors_by_type', 'Errors by Type (24h)', 'short', rows, 'error_type', 'value');
}

async function p95Latency(wsId: string): Promise<Panel> {
  const rows = await query<{ ts: string; agent_name: string; value: string }>(
    `SELECT toStartOfFiveMinutes(timestamp) AS ts,
            agent_name,
            quantile(0.95)(duration_ms) / 1000.0 AS value
     FROM agent_executions
     WHERE workspace_id = {workspace_id: String}
       AND timestamp > now() - INTERVAL 6 HOUR
     GROUP BY ts, agent_name
     ORDER BY ts`,
    { workspace_id: wsId },
  );
  return timeseriesPanel('p95_latency', 'P95 Latency by Agent', 'seconds', rows, 'agent_name', 'ts', 'value');
}

async function stepDistribution(wsId: string): Promise<Panel> {
  const rows = await query<{ ts: string; bucket: string; value: string }>(
    `SELECT toStartOfHour(timestamp) AS ts,
            toString(step_count) AS bucket,
            count() AS value
     FROM agent_executions
     WHERE workspace_id = {workspace_id: String}
       AND timestamp > now() - INTERVAL 24 HOUR
     GROUP BY ts, bucket
     ORDER BY ts, bucket`,
    { workspace_id: wsId },
  );
  return heatmapPanel('step_distribution', 'Step Distribution (24h)', 'short', rows, 'bucket', 'ts', 'value');
}

async function guardrailPassFail(wsId: string): Promise<Panel> {
  const rows = await query<{ guardrail_result: string; value: string }>(
    `SELECT guardrail_result, count() AS value
     FROM guardrail_validations
     WHERE workspace_id = {workspace_id: String}
       AND timestamp > now() - INTERVAL 24 HOUR
     GROUP BY guardrail_result
     ORDER BY value DESC`,
    { workspace_id: wsId },
  );
  return barPanel('guardrail_pass_fail', 'Guardrail Pass/Fail (24h)', 'short', rows, 'guardrail_result', 'value');
}

// ---------------------------------------------------------------------------
// Error fallback panel
// ---------------------------------------------------------------------------

function errorPanel(id: string, message: string): Panel {
  return {
    id,
    title: id,
    type: 'stat',
    unit: 'short',
    data: { resultType: 'vector', result: [] },
    subtitle: `Error: ${message}`,
    subtitleColor: 'danger',
  };
}
