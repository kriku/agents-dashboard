import { Router, type Router as RouterType } from 'express';
import type { ViewListItem, ViewResponse } from '@agent-monitor/shared';

const router: RouterType = Router();

// ---------------------------------------------------------------------------
// Stub data — replace with ClickHouse queries
// ---------------------------------------------------------------------------

const viewList: ViewListItem[] = [
  { id: 'agent-overview', title: 'Agent Execution Overview', description: 'Real-time agent fleet health and performance' },
  { id: 'tool-call-performance', title: 'Tool Call Performance', description: 'Latency, error rates, and frequency for tool calls' },
  { id: 'llm-token-usage', title: 'LLM Token Usage', description: 'Token consumption and cost by model and agent' },
  { id: 'error-breakdown', title: 'Error Breakdown', description: 'Error classification and trends across the fleet' },
  { id: 'cost-tracking', title: 'Cost Tracking', description: 'Estimated costs by agent, model, and time period' },
];

function stubView(id: string): ViewResponse | undefined {
  const meta = viewList.find((v) => v.id === id);
  if (!meta) return undefined;
  return {
    view: { ...meta, refreshSec: 30 },
    panels: [], // TODO: populate from ClickHouse
  };
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/** GET /api/views — list available views */
router.get('/', (_req, res) => {
  res.json(viewList);
});

/** GET /api/views/:viewId — all panels for a view */
router.get('/:viewId', (req, res) => {
  const view = stubView(req.params.viewId);
  if (!view) {
    res.status(404).json({ error: `View not found: ${req.params.viewId}` });
    return;
  }
  res.json(view);
});

/** GET /api/views/:viewId/panels/:panelId — single panel */
router.get('/:viewId/panels/:panelId', (req, res) => {
  const view = stubView(req.params.viewId);
  if (!view) {
    res.status(404).json({ error: `View not found: ${req.params.viewId}` });
    return;
  }
  const panel = view.panels.find((p) => p.id === req.params.panelId);
  if (!panel) {
    res.status(404).json({ error: `Panel not found: ${req.params.panelId}` });
    return;
  }
  res.json(panel);
});

export { router as viewsRouter };
