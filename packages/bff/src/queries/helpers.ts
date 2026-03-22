import type { Panel, PanelUnit, PanelData } from '@agent-monitor/shared';

// ---------------------------------------------------------------------------
// Panel builders — convert ClickHouse rows into Panel objects
// ---------------------------------------------------------------------------

/** Build a stat panel from a single scalar value */
export function statPanel(
  id: string,
  title: string,
  unit: PanelUnit,
  value: number | string | null,
  opts?: { subtitle?: string; subtitleColor?: Panel['subtitleColor']; displayValue?: string },
): Panel {
  const now = Math.floor(Date.now() / 1000);
  const v = value == null ? '0' : String(value);
  return {
    id,
    title,
    type: 'stat',
    unit,
    data: { resultType: 'vector', result: [{ metric: {}, value: [now, v] }] },
    ...(opts?.subtitle && { subtitle: opts.subtitle, subtitleColor: opts.subtitleColor }),
    ...(opts?.displayValue && { displayValue: opts.displayValue }),
  };
}

/** Build a timeseries panel by grouping rows into series by a label column */
export function timeseriesPanel<T extends Record<string, unknown>>(
  id: string,
  title: string,
  unit: PanelUnit,
  rows: T[],
  groupByCol: keyof T & string,
  tsCol: keyof T & string,
  valueCol: keyof T & string,
): Panel {
  return {
    id,
    title,
    type: 'timeseries',
    unit,
    data: groupToMatrix(rows, groupByCol, tsCol, valueCol),
  };
}

/** Build a timeseries panel from rows that have no group-by (single series) */
export function singleSeriesPanel<T extends Record<string, unknown>>(
  id: string,
  title: string,
  unit: PanelUnit,
  rows: T[],
  tsCol: keyof T & string,
  valueCol: keyof T & string,
  metricLabel?: Record<string, string>,
): Panel {
  const values: [number, string][] = rows.map((r) => [
    toEpoch(r[tsCol]),
    String(r[valueCol] ?? '0'),
  ]);
  return {
    id,
    title,
    type: 'timeseries',
    unit,
    data: {
      resultType: 'matrix',
      result: [{ metric: metricLabel ?? {}, values }],
    },
  };
}

/** Build a bar panel from rows with a label column and value column */
export function barPanel<T extends Record<string, unknown>>(
  id: string,
  title: string,
  unit: PanelUnit,
  rows: T[],
  labelCol: keyof T & string,
  valueCol: keyof T & string,
): Panel {
  const now = Math.floor(Date.now() / 1000);
  return {
    id,
    title,
    type: 'bar',
    unit,
    data: {
      resultType: 'vector',
      result: rows.map((r) => ({
        metric: { [labelCol]: String(r[labelCol]) },
        value: [now, String(r[valueCol] ?? '0')] as [number, string],
      })),
    },
  };
}

/** Build a table panel from rows, mapping all columns into metric labels */
export function tablePanel<T extends Record<string, unknown>>(
  id: string,
  title: string,
  unit: PanelUnit,
  rows: T[],
  countCol?: keyof T & string,
): Panel {
  const now = Math.floor(Date.now() / 1000);
  return {
    id,
    title,
    type: 'table',
    unit,
    data: {
      resultType: 'vector',
      result: rows.map((r) => {
        const metric: Record<string, string> = {};
        for (const [k, v] of Object.entries(r)) {
          metric[k] = String(v ?? '');
        }
        const val = countCol ? String(r[countCol] ?? '0') : '1';
        return { metric, value: [now, val] as [number, string] };
      }),
    },
  };
}

/** Build a heatmap panel from rows with ts, bucket, and value columns */
export function heatmapPanel<T extends Record<string, unknown>>(
  id: string,
  title: string,
  unit: PanelUnit,
  rows: T[],
  bucketCol: keyof T & string,
  tsCol: keyof T & string,
  valueCol: keyof T & string,
): Panel {
  return {
    id,
    title,
    type: 'heatmap',
    unit,
    data: groupToMatrix(rows, bucketCol, tsCol, valueCol),
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Group rows by a column into a matrix (multiple series) */
function groupToMatrix<T extends Record<string, unknown>>(
  rows: T[],
  groupByCol: string,
  tsCol: string,
  valueCol: string,
): PanelData {
  const groups = new Map<string, [number, string][]>();
  for (const row of rows) {
    const key = String(row[groupByCol] ?? '');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push([toEpoch(row[tsCol]), String(row[valueCol] ?? '0')]);
  }
  return {
    resultType: 'matrix',
    result: Array.from(groups.entries()).map(([label, values]) => ({
      metric: { [groupByCol]: label },
      values,
    })),
  };
}

/** Convert a ClickHouse timestamp (string or Date) to Unix epoch seconds */
function toEpoch(v: unknown): number {
  if (typeof v === 'number') return v;
  const str = String(v);
  // ClickHouse returns "2026-03-22 14:00:00" or ISO format
  const ms = Date.parse(str);
  return Number.isNaN(ms) ? 0 : Math.floor(ms / 1000);
}
