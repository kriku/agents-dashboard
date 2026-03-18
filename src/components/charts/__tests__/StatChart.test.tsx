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

  it('renders metric label when no title', () => {
    render(<StatChart data={vectorData('42', { agent_name: 'order-processor' })} unit="short" />);
    expect(screen.getByText('order-processor')).toBeInTheDocument();
  });

  it('renders title prop as label instead of metric', () => {
    render(<StatChart data={vectorData('42', { agent_name: 'order-processor' })} unit="short" title="Active Agents" />);
    expect(screen.getByText('Active Agents')).toBeInTheDocument();
    expect(screen.queryByText('order-processor')).not.toBeInTheDocument();
  });

  it('renders label before value', () => {
    const { container } = render(<StatChart data={vectorData('42')} unit="short" title="My Stat" />);
    const label = container.querySelector('.stat-label');
    const value = container.querySelector('.stat-value');
    expect(label).toBeInTheDocument();
    expect(value).toBeInTheDocument();
    // Label should come before value in DOM
    expect(label!.compareDocumentPosition(value!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });
});
