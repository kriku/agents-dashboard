import { http, HttpResponse } from 'msw';
import {
  mockViewList,
  mockAgentOverview,
  mockToolCallPerformance,
  mockLLMTokenUsage,
  mockErrorBreakdown,
  mockCostTracking,
} from './bff-mock-data';
import type { ViewResponse } from '@agent-monitor/shared';

const viewMap: Record<string, ViewResponse> = {
  'agent-overview': mockAgentOverview,
  'tool-call-performance': mockToolCallPerformance,
  'llm-token-usage': mockLLMTokenUsage,
  'error-breakdown': mockErrorBreakdown,
  'cost-tracking': mockCostTracking,
};

// Wildcard prefix so handlers match regardless of VITE_API_BASE_URL origin
// (e.g. both relative "/api/views" and absolute "https://api.monitoring.example.com/api/views").
export const handlers = [
  // GET /api/views — list all views
  http.get('*/api/views', () => {
    return HttpResponse.json(mockViewList);
  }),

  // GET /api/views/:viewId — fetch view data
  http.get('*/api/views/:viewId', ({ params }) => {
    const { viewId } = params;
    const view = viewMap[viewId as string];
    if (!view) {
      return HttpResponse.json({ error: `View not found: ${viewId}` }, { status: 404 });
    }
    return HttpResponse.json(structuredClone(view));
  }),

  // GET /api/views/:viewId/panels/:panelId — fetch single panel
  http.get('*/api/views/:viewId/panels/:panelId', ({ params }) => {
    const { viewId, panelId } = params;
    const view = viewMap[viewId as string];
    if (!view) {
      return HttpResponse.json({ error: `View not found: ${viewId}` }, { status: 404 });
    }
    const panel = view.panels.find((p) => p.id === panelId);
    if (!panel) {
      return HttpResponse.json({ error: `Panel not found: ${viewId}/${panelId}` }, { status: 404 });
    }
    return HttpResponse.json(structuredClone(panel));
  }),

  // GET /api/auth/demo-token — issue a test JWT
  http.get('*/api/auth/demo-token', () => {
    return HttpResponse.json({ token: 'test-demo-token' });
  }),

  // GET /api/health
  http.get('*/api/health', () => {
    return HttpResponse.json({ status: 'ok' });
  }),

  // GET /api/ready
  http.get('*/api/ready', () => {
    return HttpResponse.json({ status: 'ready' });
  }),
];
