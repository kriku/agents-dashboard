import type { Panel, ViewListItem } from '@agent-monitor/shared';
import { getAgentOverviewPanels } from './agent-overview.js';
import { getToolPerformancePanels } from './tool-performance.js';
import { getLlmTokenUsagePanels } from './llm-token-usage.js';
import { getErrorBreakdownPanels } from './error-breakdown.js';
import { getCostTrackingPanels } from './cost-tracking.js';

export interface ViewDefinition {
  id: string;
  title: string;
  description: string;
  refreshSec: number;
  queryFn: (workspaceId: string) => Promise<Panel[]>;
}

export const viewRegistry = new Map<string, ViewDefinition>([
  ['agent-overview', {
    id: 'agent-overview',
    title: 'Agent Execution Overview',
    description: 'Real-time agent fleet health and performance',
    refreshSec: 30,
    queryFn: getAgentOverviewPanels,
  }],
  ['tool-call-performance', {
    id: 'tool-call-performance',
    title: 'Tool Call Performance',
    description: 'Latency, error rates, and frequency for tool calls',
    refreshSec: 30,
    queryFn: getToolPerformancePanels,
  }],
  ['llm-token-usage', {
    id: 'llm-token-usage',
    title: 'LLM Token Usage',
    description: 'Token consumption and cost by model and agent',
    refreshSec: 60,
    queryFn: getLlmTokenUsagePanels,
  }],
  ['error-breakdown', {
    id: 'error-breakdown',
    title: 'Error Breakdown',
    description: 'Error classification and trends across the fleet',
    refreshSec: 30,
    queryFn: getErrorBreakdownPanels,
  }],
  ['cost-tracking', {
    id: 'cost-tracking',
    title: 'Cost Tracking',
    description: 'Estimated costs by agent, model, and time period',
    refreshSec: 300,
    queryFn: getCostTrackingPanels,
  }],
]);

/** List all registered views (for GET /api/views) */
export function listViews(): ViewListItem[] {
  return Array.from(viewRegistry.values()).map(({ id, title, description }) => ({
    id,
    title,
    description,
  }));
}
