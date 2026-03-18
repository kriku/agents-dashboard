import type { Panel, ViewResponse, VectorResult, MatrixResult } from '../types/views';

const NOW = Math.floor(Date.now() / 1000);

/** Create a stat panel with a single vector result */
export function makeStatPanel(overrides: Partial<Panel> = {}): Panel {
  return {
    id: 'test-stat',
    title: 'Test Stat',
    type: 'stat',
    unit: 'short',
    data: {
      resultType: 'vector',
      result: [{ metric: {}, value: [NOW, '42'] }],
    },
    ...overrides,
  };
}

/** Create a timeseries panel with matrix data */
export function makeTimeSeriesPanel(overrides: Partial<Panel> = {}): Panel {
  const timestamps = Array.from({ length: 10 }, (_, i) => NOW - (9 - i) * 60);
  return {
    id: 'test-timeseries',
    title: 'Test Time Series',
    type: 'timeseries',
    unit: 'reqps',
    data: {
      resultType: 'matrix',
      result: [
        {
          metric: { series: 'a' },
          values: timestamps.map((t) => [t, (Math.random() * 10).toFixed(2)]),
        },
      ],
    },
    ...overrides,
  };
}

/** Create a bar panel with vector data */
export function makeBarPanel(overrides: Partial<Panel> = {}): Panel {
  return {
    id: 'test-bar',
    title: 'Test Bar',
    type: 'bar',
    unit: 'short',
    data: {
      resultType: 'vector',
      result: [
        { metric: { category: 'A' }, value: [NOW, '100'] },
        { metric: { category: 'B' }, value: [NOW, '75'] },
        { metric: { category: 'C' }, value: [NOW, '50'] },
      ] as VectorResult[],
    },
    ...overrides,
  };
}

/** Create a heatmap panel with matrix data */
export function makeHeatmapPanel(overrides: Partial<Panel> = {}): Panel {
  const timestamps = Array.from({ length: 10 }, (_, i) => NOW - (9 - i) * 60);
  return {
    id: 'test-heatmap',
    title: 'Test Heatmap',
    type: 'heatmap',
    unit: 'short',
    data: {
      resultType: 'matrix',
      result: [
        {
          metric: { le: '1' },
          values: timestamps.map((t) => [t, (Math.random() * 5).toFixed(2)]),
        },
        {
          metric: { le: '5' },
          values: timestamps.map((t) => [t, (Math.random() * 10).toFixed(2)]),
        },
      ] as MatrixResult[],
    },
    ...overrides,
  };
}

/** Create a complete view response */
export function makeViewResponse(overrides: Partial<ViewResponse> = {}): ViewResponse {
  return {
    view: {
      id: 'test-view',
      title: 'Test View',
      description: 'A test view',
      refreshSec: 30,
      ...overrides.view,
    },
    panels: overrides.panels ?? [
      makeStatPanel(),
      makeTimeSeriesPanel(),
      makeBarPanel(),
    ],
  };
}
