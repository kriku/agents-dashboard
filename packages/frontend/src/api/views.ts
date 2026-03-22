import { apiFetch } from './client';
import type { ViewResponse, ViewListItem, Panel } from '@agent-monitor/shared';

/** GET /api/views — list all available views */
export function fetchViewList(): Promise<ViewListItem[]> {
  return apiFetch<ViewListItem[]>('/api/views');
}

/** GET /api/views/{viewId} — fetch all panel data for a view */
export function fetchView(viewId: string): Promise<ViewResponse> {
  return apiFetch<ViewResponse>(`/api/views/${viewId}`);
}

/** GET /api/views/{viewId}/panels/{panelId} — fetch single panel */
export function fetchPanel(viewId: string, panelId: string): Promise<Panel> {
  return apiFetch<Panel>(`/api/views/${viewId}/panels/${panelId}`);
}
