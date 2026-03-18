import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('echarts-for-react', () => ({
  default: (props: any) => (
    <div data-testid="echarts" data-option={JSON.stringify(props.option)} />
  ),
}));

import { GaugeChart } from '../GaugeChart';
import type { PanelData } from '../../../types/views';

const NOW = Math.floor(Date.now() / 1000);

describe('GaugeChart', () => {
  it('renders gauge with value and max:100 for percent', () => {
    const data: PanelData = {
      resultType: 'vector',
      result: [{ metric: {}, value: [NOW, '72.5'] }],
    };
    render(<GaugeChart data={data} unit="percent" />);
    const el = screen.getByTestId('echarts');
    const option = JSON.parse(el.getAttribute('data-option')!);
    expect(option.series[0].data[0].value).toBe(72.5);
    expect(option.series[0].max).toBe(100);
  });

  it('renders placeholder for empty data', () => {
    const empty: PanelData = { resultType: 'vector', result: [] };
    render(<GaugeChart data={empty} unit="percent" />);
    expect(screen.getByText('No data')).toBeInTheDocument();
  });
});
