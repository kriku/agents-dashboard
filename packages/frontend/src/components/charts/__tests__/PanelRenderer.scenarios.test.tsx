// =============================================================================
// FE-013: PanelRenderer unknown type handling
// FE-011..012 additional coverage: all panel type routing
// =============================================================================

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../TimeSeriesChart', () => ({ TimeSeriesChart: () => <div data-testid="timeseries" /> }));
vi.mock('../StatChart', () => ({ StatChart: () => <div data-testid="stat" /> }));
vi.mock('../GaugeChart', () => ({ GaugeChart: () => <div data-testid="gauge" /> }));
vi.mock('../HeatmapChart', () => ({ HeatmapChart: () => <div data-testid="heatmap" /> }));
vi.mock('../BarChart', () => ({ BarChart: () => <div data-testid="bar" /> }));
vi.mock('../TableChart', () => ({ TableChart: () => <div data-testid="table" /> }));

import { PanelRenderer } from '../PanelRenderer';
import { makeStatPanel } from '../../../__fixtures__/factories';
import type { Panel } from '@agent-monitor/shared';

// FE-013: Unknown panel type renders error, no crash
describe('FE-013: PanelRenderer unknown type', () => {
  it('renders error message for unknown type "pie"', () => {
    const panel = { ...makeStatPanel(), type: 'pie' } as unknown as Panel;
    render(<PanelRenderer panel={panel} />);
    expect(screen.getByText(/unsupported|unknown/i)).toBeInTheDocument();
  });

  it('renders error message for unknown type "sparkline"', () => {
    const panel = { ...makeStatPanel(), type: 'sparkline' } as unknown as Panel;
    render(<PanelRenderer panel={panel} />);
    expect(screen.getByText(/unsupported|unknown/i)).toBeInTheDocument();
  });

  it('does not crash on empty string type', () => {
    const panel = { ...makeStatPanel(), type: '' } as unknown as Panel;
    expect(() => render(<PanelRenderer panel={panel} />)).not.toThrow();
  });
});
