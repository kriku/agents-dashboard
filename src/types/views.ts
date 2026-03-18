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
