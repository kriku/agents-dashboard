import { Router, type Router as RouterType } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import type { JwtPayload } from '../middleware/auth.js';

const router: RouterType = Router();

const DEMO_WORKSPACES: Record<string, Omit<JwtPayload, 'sub'>> = {
  'ws-acme-prod': {
    org_id: 'org-acme',
    workspace_id: 'ws-acme-prod',
    workspace_name: 'Production',
    org_name: 'Acme Corp',
    role: 'admin',
  },
  'ws-acme-staging': {
    org_id: 'org-acme',
    workspace_id: 'ws-acme-staging',
    workspace_name: 'Staging',
    org_name: 'Acme Corp',
    role: 'admin',
  },
  'ws-globex-main': {
    org_id: 'org-globex',
    workspace_id: 'ws-globex-main',
    workspace_name: 'Main',
    org_name: 'Globex Inc',
    role: 'admin',
  },
  'ws-initech-prod': {
    org_id: 'org-initech',
    workspace_id: 'ws-initech-prod',
    workspace_name: 'Production',
    org_name: 'Initech',
    role: 'admin',
  },
  'ws-initech-research': {
    org_id: 'org-initech',
    workspace_id: 'ws-initech-research',
    workspace_name: 'Research',
    org_name: 'Initech',
    role: 'viewer',
  },
};

/** GET /api/auth/demo-token — issue a demo JWT */
router.get('/demo-token', (req, res) => {
  const workspaceId = (req.query.workspace as string) || 'ws-acme-prod';
  const workspace = DEMO_WORKSPACES[workspaceId];

  if (!workspace) {
    res.status(400).json({
      error: `Unknown workspace: ${workspaceId}`,
      available: Object.keys(DEMO_WORKSPACES),
    });
    return;
  }

  const payload: JwtPayload = { sub: 'user-demo', ...workspace };
  const token = jwt.sign(payload, config.jwtSecret, { expiresIn: '24h' });

  res.json({ token });
});

export { router as authRouter };
