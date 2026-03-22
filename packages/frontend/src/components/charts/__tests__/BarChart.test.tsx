import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { BarChart } from '../BarChart';
import { makeBarPanel } from '../../../__fixtures__/factories';
import type { PanelData } from '@agent-monitor/shared';

describe('BarChart', () => {
  it('renders labels and values for each bar', () => {
    const panel = makeBarPanel();
    render(<BarChart data={panel.data} unit={panel.unit} />);
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('B')).toBeInTheDocument();
    expect(screen.getByText('C')).toBeInTheDocument();
  });

  it('renders placeholder for empty data', () => {
    const empty: PanelData = { resultType: 'vector', result: [] };
    render(<BarChart data={empty} unit="short" />);
    expect(screen.getByText('No data')).toBeInTheDocument();
  });

  it('renders bar fills with correct widths', () => {
    const panel = makeBarPanel();
    const { container } = render(<BarChart data={panel.data} unit={panel.unit} />);
    const fills = container.querySelectorAll('.bar-chart__fill');
    expect(fills).toHaveLength(3);
    // First item (100) is max → 100%, second (75) → 75%, third (50) → 50%
    expect(fills[0]).toHaveStyle({ width: '100%' });
    expect(fills[1]).toHaveStyle({ width: '75%' });
    expect(fills[2]).toHaveStyle({ width: '50%' });
  });

  it('applies per-item colors', () => {
    const panel = makeBarPanel();
    const { container } = render(<BarChart data={panel.data} unit={panel.unit} />);
    const fills = container.querySelectorAll('.bar-chart__fill');
    const colors = Array.from(fills).map((f) => (f as HTMLElement).style.background);
    // Each item has a distinct color
    expect(new Set(colors).size).toBe(3);
  });
});
