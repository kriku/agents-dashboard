// =============================================================================
// FE-034: Zero value renders as "0", not blank (component level)
// FE-001..006: Stat panel rendering scenarios
// =============================================================================

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatChart } from '../StatChart';
import type { PanelData } from '@agent-monitor/shared';

const NOW = Math.floor(Date.now() / 1000);

function vectorData(value: string, metric: Record<string, string> = {}): PanelData {
  return { resultType: 'vector', result: [{ metric, value: [NOW, value] }] };
}

// FE-034: Zero renders as "0", not blank
describe('FE-034: zero value rendering', () => {
  it('renders "0" for value "0" with short unit', () => {
    render(<StatChart data={vectorData('0')} unit="short" />);
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('renders "0%" for value "0" with percent unit', () => {
    render(<StatChart data={vectorData('0')} unit="percent" />);
    expect(screen.getByText('0%')).toBeInTheDocument();
  });

  it('renders "$0" for value "0" with USD unit', () => {
    render(<StatChart data={vectorData('0')} unit="USD" />);
    expect(screen.getByText('$0')).toBeInTheDocument();
  });
});

// FE-001: Stat renders numeric value
describe('FE-001: stat renders numeric value', () => {
  it('renders "42" for value "42"', () => {
    render(<StatChart data={vectorData('42')} unit="short" />);
    expect(screen.getByText('42')).toBeInTheDocument();
  });
});

// FE-006: Large numbers formatted
describe('FE-006: large number formatting', () => {
  it('renders "14.8M" for value "14800000"', () => {
    render(<StatChart data={vectorData('14800000')} unit="short" />);
    expect(screen.getByText('14.8M')).toBeInTheDocument();
  });

  it('renders "48.3K" for value "48291"', () => {
    render(<StatChart data={vectorData('48291')} unit="short" />);
    expect(screen.getByText('48.3K')).toBeInTheDocument();
  });
});

// FE-005: Currency formatting
describe('FE-005: currency formatting in stat', () => {
  it('renders "$284" for value "284" with USD unit', () => {
    render(<StatChart data={vectorData('284')} unit="USD" />);
    expect(screen.getByText('$284')).toBeInTheDocument();
  });

  it('renders small cost with precision', () => {
    render(<StatChart data={vectorData('0.00526')} unit="USD" />);
    expect(screen.getByText('$0.0053')).toBeInTheDocument();
  });
});
