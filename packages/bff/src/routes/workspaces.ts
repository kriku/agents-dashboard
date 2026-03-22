import { Router, type Router as RouterType } from 'express';
import { query } from '../clickhouse/client.js';

const router: RouterType = Router();

interface WorkspaceRow {
  workspace_id: string;
  workspace_name: string;
  org_id: string;
  org_name: string;
  tier: string;
}

/** GET /api/workspaces — list workspaces for the authenticated org */
router.get('/', async (req, res) => {
  try {
    const rows = await query<WorkspaceRow>(
      `SELECT workspace_id, workspace_name, org_id, org_name, tier
       FROM workspaces
       WHERE org_id = {org_id: String}`,
      { org_id: req.user!.org_id },
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch workspaces', detail: String(err) });
  }
});

export { router as workspacesRouter };
