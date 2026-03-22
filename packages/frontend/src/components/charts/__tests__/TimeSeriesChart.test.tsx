import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('uplot-react', () => ({
  default: (props: any) => (
    <div
      data-testid="uplot"
      data-data={JSON.stringify(props.data)}
      data-options={JSON.stringify(props.options)}
    />
  ),
}));

vi.mock('uplot', () => ({ default: {} }));

import { TimeSeriesChart } from '../TimeSeriesChart';
import { makeTimeSeriesPanel } from '../../../__fixtures__/factories';
import type { PanelData } from '@agent-monitor/shared';

describe('TimeSeriesChart', () => {
  it('passes AlignedData format [timestamps, ...series]', () => {
    const panel = makeTimeSeriesPanel();
    render(<TimeSeriesChart data={panel.data} unit={panel.unit} />);
    const el = screen.getByTestId('uplot');
    const data = JSON.parse(el.getAttribute('data-data')!);
    // First element is timestamps array, second is series values
    expect(data).toHaveLength(2); // 1 timestamp + 1 series
    expect(data[0]).toHaveLength(10); // 10 data points from factory
  });

  it('converts string values to numbers', () => {
    const panel = makeTimeSeriesPanel();
    render(<TimeSeriesChart data={panel.data} unit={panel.unit} />);
    const el = screen.getByTestId('uplot');
    const data = JSON.parse(el.getAttribute('data-data')!);
    // Series values should all be numbers, not strings
    data[1].forEach((v: any) => expect(typeof v).toBe('number'));
  });

  it('builds series labels from metric values', () => {
    const panel = makeTimeSeriesPanel();
    render(<TimeSeriesChart data={panel.data} unit={panel.unit} />);
    const el = screen.getByTestId('uplot');
    const options = JSON.parse(el.getAttribute('data-options')!);
    // series[0] is x-axis placeholder, series[1] is the data series
    expect(options.series[1].label).toBe('a');
  });

  it('renders placeholder for empty data', () => {
    const empty: PanelData = { resultType: 'matrix', result: [] };
    render(<TimeSeriesChart data={empty} unit="reqps" />);
    expect(screen.getByText('No data')).toBeInTheDocument();
  });

  it('assigns distinct colors to series', () => {
    const NOW = Math.floor(Date.now() / 1000);
    const multiSeries: PanelData = {
      resultType: 'matrix',
      result: [
        { metric: { s: 'a' }, values: [[NOW, '1'], [NOW + 60, '2']] },
        { metric: { s: 'b' }, values: [[NOW, '3'], [NOW + 60, '4']] },
      ],
    };
    render(<TimeSeriesChart data={multiSeries} unit="reqps" />);
    const el = screen.getByTestId('uplot');
    const options = JSON.parse(el.getAttribute('data-options')!);
    const colors = [options.series[1].stroke, options.series[2].stroke];
    expect(colors[0]).not.toBe(colors[1]);
  });
});
