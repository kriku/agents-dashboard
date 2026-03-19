import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../TimeSeriesChart', () => ({ TimeSeriesChart: (props: any) => <div data-testid="timeseries">{JSON.stringify(props.unit)}</div> }));
vi.mock('../StatChart', () => ({ StatChart: (props: any) => <div data-testid="stat" data-subtitle={props.subtitle ?? ''} data-value-color={props.valueColor ?? ''} data-display-value={props.displayValue ?? ''}>{JSON.stringify(props.unit)}</div> }));
vi.mock('../GaugeChart', () => ({ GaugeChart: (props: any) => <div data-testid="gauge">{JSON.stringify(props.unit)}</div> }));
vi.mock('../HeatmapChart', () => ({ HeatmapChart: () => <div data-testid="heatmap" /> }));
vi.mock('../BarChart', () => ({ BarChart: (props: any) => <div data-testid="bar">{JSON.stringify(props.unit)}</div> }));
vi.mock('../TableChart', () => ({ TableChart: () => <div data-testid="table" /> }));

import { PanelRenderer } from '../PanelRenderer';
import {
  makeStatPanel,
  makeTimeSeriesPanel,
  makeBarPanel,
  makeHeatmapPanel,
} from '../../../__fixtures__/factories';
import type { Panel } from '../../../types/views';

describe('PanelRenderer', () => {
  it('renders TimeSeriesChart for timeseries type', () => {
    render(<PanelRenderer panel={makeTimeSeriesPanel()} />);
    expect(screen.getByTestId('timeseries')).toBeInTheDocument();
  });

  it('renders StatChart for stat type', () => {
    render(<PanelRenderer panel={makeStatPanel()} />);
    expect(screen.getByTestId('stat')).toBeInTheDocument();
  });

  it('renders GaugeChart for gauge type', () => {
    const panel: Panel = { ...makeStatPanel(), type: 'gauge' };
    render(<PanelRenderer panel={panel} />);
    expect(screen.getByTestId('gauge')).toBeInTheDocument();
  });

  it('renders HeatmapChart for heatmap type', () => {
    render(<PanelRenderer panel={makeHeatmapPanel()} />);
    expect(screen.getByTestId('heatmap')).toBeInTheDocument();
  });

  it('renders BarChart for bar type', () => {
    render(<PanelRenderer panel={makeBarPanel()} />);
    expect(screen.getByTestId('bar')).toBeInTheDocument();
  });

  it('renders TableChart for table type', () => {
    const panel: Panel = {
      ...makeStatPanel(),
      type: 'table',
    };
    render(<PanelRenderer panel={panel} />);
    expect(screen.getByTestId('table')).toBeInTheDocument();
  });

  it('forwards unit prop to chart components', () => {
    render(<PanelRenderer panel={makeStatPanel({ unit: 'percent' })} />);
    expect(screen.getByTestId('stat')).toHaveTextContent('"percent"');
  });

  it('forwards subtitle, valueColor, displayValue to StatChart', () => {
    const panel = makeStatPanel({
      subtitle: '▲ 2 from yesterday',
      subtitleColor: 'success',
      valueColor: 'danger',
      displayValue: 'LLM timeout',
    });
    render(<PanelRenderer panel={panel} />);
    const el = screen.getByTestId('stat');
    expect(el).toHaveAttribute('data-subtitle', '▲ 2 from yesterday');
    expect(el).toHaveAttribute('data-value-color', 'danger');
    expect(el).toHaveAttribute('data-display-value', 'LLM timeout');
  });
});
