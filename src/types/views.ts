/** Top-level response from GET /api/views/{view_id} */
export interface ViewResponse {
  view: ViewMeta;
  panels: Panel[];
}

/** View metadata header */
export interface ViewMeta {
  id: string;
  title: string;
  description: string;
  refreshSec: number;
}

/** A single panel within a view */
export interface Panel {
  id: string;
  title: string;
  type: PanelType;
  unit: PanelUnit;
  data: PanelData;
}

export type PanelType = 'timeseries' | 'stat' | 'gauge' | 'heatmap' | 'bar' | 'table';
export type PanelUnit = 'reqps' | 'seconds' | 'bytes' | 'percent' | 'short' | 'USD' | 'tokens' | 'tokps';

/** Prometheus-compatible result envelope */
export type PanelData =
  | { resultType: 'matrix'; result: MatrixResult[] }
  | { resultType: 'vector'; result: VectorResult[] }
  | { resultType: 'scalar'; result: [number, string] };

/** Time series (for timeseries, heatmap panels) */
export interface MatrixResult {
  metric: Record<string, string>;
  values: [number, string][];
}

/** Instant vector (for stat, bar, table panels) */
export interface VectorResult {
  metric: Record<string, string>;
  value: [number, string];
}

/** Listing response from GET /api/views */
export interface ViewListItem {
  id: string;
  title: string;
  description: string;
}

// ---------------------------------------------------------------------------
// Runtime validators / type guards
// ---------------------------------------------------------------------------

export const panelTypes: PanelType[] = ['timeseries', 'stat', 'gauge', 'heatmap', 'bar', 'table'];

/** Runtime check that an unknown value is a valid Panel object */
export function isPanel(value: unknown): value is Panel {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    typeof v.title === 'string' &&
    typeof v.type === 'string' &&
    panelTypes.includes(v.type as PanelType) &&
    typeof v.data === 'object' &&
    v.data !== null
  );
}

/** Runtime check that an unknown value is a valid ViewResponse */
export function isViewResponse(value: unknown): value is ViewResponse {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.view !== 'object' || v.view === null) return false;
  if (!Array.isArray(v.panels)) return false;
  return v.panels.every(isPanel);
}

/** Runtime check that a PanelData is a metric result (vector or matrix) */
export function isMetricResult(data: PanelData): data is
  | { resultType: 'vector'; result: VectorResult[] }
  | { resultType: 'matrix'; result: MatrixResult[] } {
  return data.resultType === 'vector' || data.resultType === 'matrix';
}
