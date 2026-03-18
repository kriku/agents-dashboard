import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('echarts-for-react', () => ({
  default: (props: any) => (
    <div data-testid="echarts" data-option={JSON.stringify(props.option)} style={props.style} />
  ),
}));

import { BarChart } from '../BarChart';
import { makeBarPanel } from '../../../__fixtures__/factories';
import type { PanelData } from '../../../types/views';

describe('BarChart', () => {
  it('passes categories and values to ECharts', () => {
    const panel = makeBarPanel();
    render(<BarChart data={panel.data} unit={panel.unit} />);
    const el = screen.getByTestId('echarts');
    const option = JSON.parse(el.getAttribute('data-option')!);
    expect(option.yAxis.data).toEqual(['A', 'B', 'C']);
    expect(option.series[0].data).toHaveLength(3);
  });

  it('renders placeholder for empty data', () => {
    const empty: PanelData = { resultType: 'vector', result: [] };
    render(<BarChart data={empty} unit="short" />);
    expect(screen.getByText('No data')).toBeInTheDocument();
  });

  it('sets dynamic height based on item count', () => {
    const panel = makeBarPanel();
    render(<BarChart data={panel.data} unit={panel.unit} />);
    const el = screen.getByTestId('echarts');
    // 3 items × 40 = 120, but min 200
    expect(el.style.height).toBe('200px');
  });

  it('applies per-item colors', () => {
    const panel = makeBarPanel();
    render(<BarChart data={panel.data} unit={panel.unit} />);
    const el = screen.getByTestId('echarts');
    const option = JSON.parse(el.getAttribute('data-option')!);
    const colors = option.series[0].data.map((d: any) => d.itemStyle.color);
    // Each item has a distinct color
    expect(new Set(colors).size).toBe(3);
  });
});
