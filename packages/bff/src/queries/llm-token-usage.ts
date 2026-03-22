import type { Panel } from '@agent-monitor/shared';
import { query } from '../clickhouse/client.js';
import {
  statPanel,
  timeseriesPanel,
  barPanel,
  tablePanel,
} from './helpers.js';

export async function getLlmTokenUsagePanels(workspaceId: string): Promise<Panel[]> {
  const results = await Promise.allSettled([
    totalTokens24h(workspaceId),
    tokenRate(workspaceId),
    estimatedCost24h(workspaceId),
    avgTokensPerInvocation(workspaceId),
    tokenRateByModel(workspaceId),
    promptVsCompletion(workspaceId),
    costByModel(workspaceId),
    topTokenConsumers(workspaceId),
  ]);

  const ids = [
    'total_tokens_24h', 'token_rate', 'estimated_cost_24h', 'avg_tokens_per_invocation',
    'token_rate_by_model', 'prompt_vs_completion', 'cost_by_model', 'top_token_consumers',
  ];

  return results.map((r, i) => {
    if (r.status === 'fulfilled') return r.value;
    return errorPanel(ids[i]!, String((r as PromiseRejectedResult).reason));
  });
}

// ---------------------------------------------------------------------------
// Individual panel queries
// ---------------------------------------------------------------------------

async function totalTokens24h(wsId: string): Promise<Panel> {
  const rows = await query<{ total: string }>(
    `SELECT sum(total_tokens) AS total
     FROM llm_requests
     WHERE workspace_id = {workspace_id: String}
       AND timestamp > now() - INTERVAL 24 HOUR`,
    { workspace_id: wsId },
  );
  return statPanel('total_tokens_24h', 'Total Tokens (24h)', 'tokens', rows[0]?.total ?? '0');
}

async function tokenRate(wsId: string): Promise<Panel> {
  const rows = await query<{ rate: string }>(
    `SELECT sum(total_tokens) / 3600.0 AS rate
     FROM llm_requests
     WHERE workspace_id = {workspace_id: String}
       AND timestamp > now() - INTERVAL 1 HOUR`,
    { workspace_id: wsId },
  );
  return statPanel('token_rate', 'Token Rate (1h)', 'tokps', rows[0]?.rate ?? '0');
}

async function estimatedCost24h(wsId: string): Promise<Panel> {
  const rows = await query<{ cost: string }>(
    `SELECT round(sum(cost_usd), 2) AS cost
     FROM llm_requests
     WHERE workspace_id = {workspace_id: String}
       AND timestamp > now() - INTERVAL 24 HOUR`,
    { workspace_id: wsId },
  );
  return statPanel('estimated_cost_24h', 'Estimated Cost (24h)', 'USD', rows[0]?.cost ?? '0');
}

async function avgTokensPerInvocation(wsId: string): Promise<Panel> {
  const rows = await query<{ avg_tokens: string }>(
    `SELECT if(count() = 0, 0, round(avg(total_tokens), 0)) AS avg_tokens
     FROM llm_requests
     WHERE workspace_id = {workspace_id: String}
       AND timestamp > now() - INTERVAL 24 HOUR`,
    { workspace_id: wsId },
  );
  return statPanel('avg_tokens_per_invocation', 'Avg Tokens per Call', 'short', rows[0]?.avg_tokens ?? '0');
}

async function tokenRateByModel(wsId: string): Promise<Panel> {
  const rows = await query<{ ts: string; model: string; value: string }>(
    `SELECT toStartOfHour(timestamp) AS ts,
            model,
            sum(total_tokens) AS value
     FROM llm_requests
     WHERE workspace_id = {workspace_id: String}
       AND timestamp > now() - INTERVAL 24 HOUR
     GROUP BY ts, model
     ORDER BY ts`,
    { workspace_id: wsId },
  );
  return timeseriesPanel('token_rate_by_model', 'Tokens by Model', 'tokps', rows, 'model', 'ts', 'value');
}

async function promptVsCompletion(wsId: string): Promise<Panel> {
  const rows = await query<{ ts: string; input_total: string; output_total: string }>(
    `SELECT toStartOfHour(timestamp) AS ts,
            sum(input_tokens) AS input_total,
            sum(output_tokens) AS output_total
     FROM llm_requests
     WHERE workspace_id = {workspace_id: String}
       AND timestamp > now() - INTERVAL 24 HOUR
     GROUP BY ts
     ORDER BY ts`,
    { workspace_id: wsId },
  );

  const toValues = (col: 'input_total' | 'output_total') =>
    rows.map((r): [number, string] => {
      const ts = Date.parse(r.ts);
      return [Number.isNaN(ts) ? 0 : Math.floor(ts / 1000), String(r[col] ?? '0')];
    });

  const panel: Panel = {
    id: 'prompt_vs_completion',
    title: 'Input vs Output Tokens',
    type: 'timeseries',
    unit: 'tokps',
    data: {
      resultType: 'matrix',
      result: [
        { metric: { token_type: 'input' }, values: toValues('input_total') },
        { metric: { token_type: 'output' }, values: toValues('output_total') },
      ],
    },
  };
  return panel;
}

async function costByModel(wsId: string): Promise<Panel> {
  const rows = await query<{ model: string; value: string }>(
    `SELECT model, round(sum(cost_usd), 2) AS value
     FROM llm_requests
     WHERE workspace_id = {workspace_id: String}
       AND timestamp > now() - INTERVAL 24 HOUR
     GROUP BY model
     ORDER BY value DESC`,
    { workspace_id: wsId },
  );
  return barPanel('cost_by_model', 'Cost by Model (24h)', 'USD', rows, 'model', 'value');
}

async function topTokenConsumers(wsId: string): Promise<Panel> {
  const rows = await query<{
    agent_name: string; total_tokens: string; input_tokens: string;
    output_tokens: string; cost_usd: string; call_count: string;
  }>(
    `SELECT agent_name,
            sum(total_tokens) AS total_tokens,
            sum(input_tokens) AS input_tokens,
            sum(output_tokens) AS output_tokens,
            round(sum(cost_usd), 2) AS cost_usd,
            count() AS call_count
     FROM llm_requests
     WHERE workspace_id = {workspace_id: String}
       AND timestamp > now() - INTERVAL 24 HOUR
     GROUP BY agent_name
     ORDER BY total_tokens DESC
     LIMIT 10`,
    { workspace_id: wsId },
  );
  return tablePanel('top_token_consumers', 'Top Token Consumers (24h)', 'tokens', rows, 'call_count');
}

// ---------------------------------------------------------------------------
function errorPanel(id: string, message: string): Panel {
  return {
    id, title: id, type: 'stat', unit: 'short',
    data: { resultType: 'vector', result: [] },
    subtitle: `Error: ${message}`, subtitleColor: 'danger',
  };
}
