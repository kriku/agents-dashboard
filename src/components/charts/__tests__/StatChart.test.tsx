import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatChart } from '../StatChart';
import type { PanelData } from '../../../types/views';

const NOW = Math.floor(Date.now() / 1000);

function vectorData(value: string, metric: Record<string, string> = {}): PanelData {
  return { resultType: 'vector', result: [{ metric, value: [NOW, value] }] };
}

describe('StatChart', () => {
  it('renders formatted value for short unit', () => {
    render(<StatChart data={vectorData('48291')} unit="short" />);
    expect(screen.getByText('48.3K')).toBeInTheDocument();
  });

  it('renders formatted value for reqps unit', () => {
    render(<StatChart data={vectorData('12.5')} unit="reqps" />);
    expect(screen.getByText(/12\.5.* req\/s/)).toBeInTheDocument();
  });

  it('renders formatted value for percent unit', () => {
    render(<StatChart data={vectorData('2.34')} unit="percent" />);
    expect(screen.getByText('2.3%')).toBeInTheDocument();
  });

  it('renders formatted value for USD unit', () => {
    render(<StatChart data={vectorData('253.82')} unit="USD" />);
    expect(screen.getByText('$253.82')).toBeInTheDocument();
  });

  it('renders "--" for empty data', () => {
    const empty: PanelData = { resultType: 'vector', result: [] };
    render(<StatChart data={empty} unit="short" />);
    expect(screen.getByText('--')).toBeInTheDocument();
  });

  it('renders metric label', () => {
    render(<StatChart data={vectorData('42', { agent_name: 'order-processor' })} unit="short" />);
    expect(screen.getByText('order-processor')).toBeInTheDocument();
  });
});
