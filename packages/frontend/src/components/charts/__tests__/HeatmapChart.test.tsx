import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('echarts-for-react', () => ({
  default: (props: any) => (
    <div data-testid="echarts" data-option={JSON.stringify(props.option)} />
  ),
}));

import { HeatmapChart } from '../HeatmapChart';
import { makeHeatmapPanel } from '../../../__fixtures__/factories';
import type { PanelData } from '@agent-monitor/shared';

describe('HeatmapChart', () => {
  it('renders heatmap with le labels on y-axis', () => {
    const panel = makeHeatmapPanel();
    render(<HeatmapChart data={panel.data} />);
    const el = screen.getByTestId('echarts');
    const option = JSON.parse(el.getAttribute('data-option')!);
    expect(option.yAxis.data).toEqual(['1', '5']);
    expect(option.series[0].type).toBe('heatmap');
    expect(option.series[0].data.length).toBeGreaterThan(0);
  });

  it('renders placeholder for empty data', () => {
    const empty: PanelData = { resultType: 'matrix', result: [] };
    render(<HeatmapChart data={empty} />);
    expect(screen.getByText('No data')).toBeInTheDocument();
  });
});
