import type { Panel } from '@agent-monitor/shared';
import { query } from '../clickhouse/client.js';
import {
  statPanel,
  timeseriesPanel,
  singleSeriesPanel,
  barPanel,
} from './helpers.js';

export async function getCostTrackingPanels(workspaceId: string): Promise<Panel[]> {
  const results = await Promise.allSettled([
    estimatedDailyCost(workspaceId),
    projectedMonthlyCost(workspaceId),
    costPerInvocationAvg(workspaceId),
    costChangeWow(workspaceId),
    costTrend(workspaceId),
    costPerInvocation(workspaceId),
    costByAgent(workspaceId),
    costByModel(workspaceId),
  ]);

  const ids = [
    'estimated_daily_cost', 'projected_monthly_cost', 'cost_per_invocation_avg', 'cost_change_wow',
    'cost_trend', 'cost_per_invocation', 'cost_by_agent', 'cost_by_model',
  ];

  return results.map((r, i) => {
    if (r.status === 'fulfilled') return r.value;
    return errorPanel(ids[i]!, String((r as PromiseRejectedResult).reason));
  });
}

// ---------------------------------------------------------------------------
// Individual panel queries
// ---------------------------------------------------------------------------

async function estimatedDailyCost(wsId: string): Promise<Panel> {
  const rows = await query<{ cost: string }>(
    `SELECT round(sum(cost_usd), 2) AS cost
     FROM llm_requests
     WHERE workspace_id = {workspace_id: String}
       AND timestamp >= toStartOfDay(now())`,
    { workspace_id: wsId },
  );
  return statPanel('estimated_daily_cost', 'Estimated Daily Cost', 'USD', rows[0]?.cost ?? '0');
}

async function projectedMonthlyCost(wsId: string): Promise<Panel> {
  const rows = await query<{ projected: string }>(
    `SELECT round(
       sum(cost_usd)
       / greatest(dateDiff('day', toStartOfMonth(now()), now()) + 1, 1)
       * dateDiff('day', toStartOfMonth(now()), toStartOfMonth(now()) + INTERVAL 1 MONTH),
       2
     ) AS projected
     FROM llm_requests
     WHERE workspace_id = {workspace_id: String}
       AND timestamp >= toStartOfMonth(now())`,
    { workspace_id: wsId },
  );
  return statPanel('projected_monthly_cost', 'Projected Monthly Cost', 'USD', rows[0]?.projected ?? '0');
}

async function costPerInvocationAvg(wsId: string): Promise<Panel> {
  const rows = await query<{ avg_cost: string }>(
    `SELECT round(
       if(count() = 0, 0, sum(estimated_cost_usd) / count()),
       4
     ) AS avg_cost
     FROM agent_executions
     WHERE workspace_id = {workspace_id: String}
       AND timestamp > now() - INTERVAL 24 HOUR`,
    { workspace_id: wsId },
  );
  return statPanel('cost_per_invocation_avg', 'Avg Cost per Invocation', 'USD', rows[0]?.avg_cost ?? '0');
}

async function costChangeWow(wsId: string): Promise<Panel> {
  const rows = await query<{ change_pct: string }>(
    `WITH
       this_week AS (
         SELECT sum(cost_usd) AS cost
         FROM llm_requests
         WHERE workspace_id = {workspace_id: String}
           AND timestamp > now() - INTERVAL 7 DAY
       ),
       last_week AS (
         SELECT sum(cost_usd) AS cost
         FROM llm_requests
         WHERE workspace_id = {workspace_id: String}
           AND timestamp > now() - INTERVAL 14 DAY
           AND timestamp <= now() - INTERVAL 7 DAY
       )
     SELECT round(
       if(last_week.cost = 0, 0, (this_week.cost - last_week.cost) * 100.0 / last_week.cost),
       1
     ) AS change_pct
     FROM this_week, last_week`,
    { workspace_id: wsId },
  );
  return statPanel('cost_change_wow', 'Week-over-Week Change', 'percent', rows[0]?.change_pct ?? '0');
}

async function costTrend(wsId: string): Promise<Panel> {
  const rows = await query<{ ts: string; value: string }>(
    `SELECT toStartOfDay(timestamp) AS ts,
            round(sum(cost_usd), 2) AS value
     FROM llm_requests
     WHERE workspace_id = {workspace_id: String}
       AND timestamp > now() - INTERVAL 30 DAY
     GROUP BY ts
     ORDER BY ts`,
    { workspace_id: wsId },
  );
  return singleSeriesPanel('cost_trend', 'Daily Cost Trend (30d)', 'USD', rows, 'ts', 'value');
}

async function costPerInvocation(wsId: string): Promise<Panel> {
  const rows = await query<{ ts: string; agent_name: string; value: string }>(
    `SELECT toStartOfDay(timestamp) AS ts,
            agent_name,
            round(if(count() = 0, 0, sum(estimated_cost_usd) / count()), 4) AS value
     FROM agent_executions
     WHERE workspace_id = {workspace_id: String}
       AND timestamp > now() - INTERVAL 7 DAY
     GROUP BY ts, agent_name
     ORDER BY ts`,
    { workspace_id: wsId },
  );
  return timeseriesPanel('cost_per_invocation', 'Cost per Invocation by Agent', 'USD', rows, 'agent_name', 'ts', 'value');
}

async function costByAgent(wsId: string): Promise<Panel> {
  const rows = await query<{ agent_name: string; value: string }>(
    `SELECT agent_name, round(sum(estimated_cost_usd), 2) AS value
     FROM agent_executions
     WHERE workspace_id = {workspace_id: String}
       AND timestamp > now() - INTERVAL 7 DAY
     GROUP BY agent_name
     ORDER BY value DESC`,
    { workspace_id: wsId },
  );
  return barPanel('cost_by_agent', 'Cost by Agent (7d)', 'USD', rows, 'agent_name', 'value');
}

async function costByModel(wsId: string): Promise<Panel> {
  const rows = await query<{ model: string; value: string }>(
    `SELECT model, round(sum(cost_usd), 2) AS value
     FROM llm_requests
     WHERE workspace_id = {workspace_id: String}
       AND timestamp > now() - INTERVAL 7 DAY
     GROUP BY model
     ORDER BY value DESC`,
    { workspace_id: wsId },
  );
  return barPanel('cost_by_model', 'Cost by Model (7d)', 'USD', rows, 'model', 'value');
}

// ---------------------------------------------------------------------------
function errorPanel(id: string, message: string): Panel {
  return {
    id, title: id, type: 'stat', unit: 'short',
    data: { resultType: 'vector', result: [] },
    subtitle: `Error: ${message}`, subtitleColor: 'danger',
  };
}
