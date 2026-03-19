import { http, HttpResponse } from 'msw';
import {
  mockViewList,
  mockAgentOverview,
  mockToolCallPerformance,
  mockLLMTokenUsage,
  mockErrorBreakdown,
  mockCostTracking,
} from './bff-mock-data';
import type { ViewResponse } from '../types/views';

const viewMap: Record<string, ViewResponse> = {
  'agent-overview': mockAgentOverview,
  'tool-call-performance': mockToolCallPerformance,
  'llm-token-usage': mockLLMTokenUsage,
  'error-breakdown': mockErrorBreakdown,
  'cost-tracking': mockCostTracking,
};

export const handlers = [
  // GET /api/views — list all views
  http.get('/api/views', () => {
    return HttpResponse.json(mockViewList);
  }),

  // GET /api/views/:viewId — fetch view data
  http.get('/api/views/:viewId', ({ params }) => {
    const { viewId } = params;
    const view = viewMap[viewId as string];
    if (!view) {
      return HttpResponse.json({ error: `View not found: ${viewId}` }, { status: 404 });
    }
    return HttpResponse.json(structuredClone(view));
  }),

  // GET /api/views/:viewId/panels/:panelId — fetch single panel
  http.get('/api/views/:viewId/panels/:panelId', ({ params }) => {
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

  // GET /api/health
  http.get('/api/health', () => {
    return HttpResponse.json({ status: 'ok' });
  }),

  // GET /api/ready
  http.get('/api/ready', () => {
    return HttpResponse.json({ status: 'ready' });
  }),
];
