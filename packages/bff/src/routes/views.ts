import { Router, type Router as RouterType } from 'express';
import { viewRegistry, listViews } from '../queries/registry.js';
import { logger } from '../logger.js';

const router: RouterType = Router();

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/** GET /api/views — list available views */
router.get('/', (_req, res) => {
  res.json(listViews());
});

/** GET /api/views/:viewId — all panels for a view */
router.get('/:viewId', async (req, res) => {
  const viewDef = viewRegistry.get(req.params.viewId);
  if (!viewDef) {
    res.status(404).json({ error: `View not found: ${req.params.viewId}` });
    return;
  }

  const workspaceId = req.user!.workspace_id;
  const start = performance.now();

  try {
    const panels = await viewDef.queryFn(workspaceId);
    const durationMs = (performance.now() - start).toFixed(1);
    logger.info({ viewId: viewDef.id, workspaceId, durationMs, panelCount: panels.length }, 'view rendered');

    res.json({
      view: {
        id: viewDef.id,
        title: viewDef.title,
        description: viewDef.description,
        refreshSec: viewDef.refreshSec,
      },
      panels,
    });
  } catch (err) {
    logger.error({ err, viewId: viewDef.id, workspaceId }, 'view query failed');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** GET /api/views/:viewId/panels/:panelId — single panel */
router.get('/:viewId/panels/:panelId', async (req, res) => {
  const viewDef = viewRegistry.get(req.params.viewId);
  if (!viewDef) {
    res.status(404).json({ error: `View not found: ${req.params.viewId}` });
    return;
  }

  const workspaceId = req.user!.workspace_id;

  try {
    const panels = await viewDef.queryFn(workspaceId);
    const panel = panels.find((p) => p.id === req.params.panelId);
    if (!panel) {
      res.status(404).json({ error: `Panel not found: ${req.params.panelId}` });
      return;
    }
    res.json(panel);
  } catch (err) {
    logger.error({ err, viewId: viewDef.id, panelId: req.params.panelId }, 'panel query failed');
    res.status(500).json({ error: 'Internal server error' });
  }
});

export { router as viewsRouter };
