import { describe, it, expect } from 'vitest';
import { isPanel, isViewResponse, isMetricResult, panelTypes } from '@agent-monitor/shared';
import { makeStatPanel, makeViewResponse } from '../__fixtures__/factories';

// ---------------------------------------------------------------------------
// panelTypes
// ---------------------------------------------------------------------------
describe('panelTypes', () => {
  it('contains all 6 panel types', () => {
    expect(panelTypes).toEqual(
      expect.arrayContaining(['timeseries', 'stat', 'gauge', 'heatmap', 'bar', 'table']),
    );
    expect(panelTypes).toHaveLength(6);
  });
});

// ---------------------------------------------------------------------------
// isPanel
// ---------------------------------------------------------------------------
describe('isPanel', () => {
  it('returns true for a valid panel', () => {
    expect(isPanel(makeStatPanel())).toBe(true);
  });

  it('returns false when type is missing', () => {
    const { type: _, ...noType } = makeStatPanel();
    expect(isPanel(noType)).toBe(false);
  });

  it('returns false for invalid type value', () => {
    expect(isPanel({ ...makeStatPanel(), type: 'sparkline' })).toBe(false);
  });

  it('returns false when data is missing', () => {
    const { data: _, ...noData } = makeStatPanel();
    expect(isPanel(noData)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isViewResponse
// ---------------------------------------------------------------------------
describe('isViewResponse', () => {
  it('returns true for valid view response', () => {
    expect(isViewResponse(makeViewResponse())).toBe(true);
  });

  it('returns false when view is missing', () => {
    const { view: _, ...noView } = makeViewResponse();
    expect(isViewResponse(noView)).toBe(false);
  });

  it('returns false when panels is empty but valid', () => {
    expect(isViewResponse(makeViewResponse({ panels: [] }))).toBe(true);
  });

  it('returns false when panels is not an array', () => {
    expect(isViewResponse({ view: { id: 'x', title: 'x', description: '', refreshSec: 30 }, panels: 'bad' })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isMetricResult
// ---------------------------------------------------------------------------
describe('isMetricResult', () => {
  it('returns true for vector result', () => {
    expect(isMetricResult({ resultType: 'vector', result: [] })).toBe(true);
  });

  it('returns true for matrix result', () => {
    expect(isMetricResult({ resultType: 'matrix', result: [] })).toBe(true);
  });

  it('returns false for scalar result', () => {
    expect(isMetricResult({ resultType: 'scalar', result: [0, '1'] })).toBe(false);
  });
});
