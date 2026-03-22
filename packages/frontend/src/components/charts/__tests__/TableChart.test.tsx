import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TableChart } from '../TableChart';
import type { PanelData, VectorResult } from '@agent-monitor/shared';

const NOW = Math.floor(Date.now() / 1000);

describe('TableChart', () => {
  const tableData: PanelData = {
    resultType: 'vector',
    result: [
      { metric: { tool_name: 'web_search', agent_name: 'triage' }, value: [NOW, '2.87'] },
      { metric: { tool_name: 'sql_query', agent_name: 'order' }, value: [NOW, '1.56'] },
    ] as VectorResult[],
  };

  it('renders correct number of rows', () => {
    render(<TableChart data={tableData} />);
    const rows = screen.getAllByRole('row');
    // 1 header + 2 data rows
    expect(rows).toHaveLength(3);
  });

  it('renders column headers from metric keys', () => {
    render(<TableChart data={tableData} />);
    expect(screen.getByText('tool_name')).toBeInTheDocument();
    expect(screen.getByText('agent_name')).toBeInTheDocument();
    expect(screen.getByText('Value')).toBeInTheDocument();
  });

  it('renders raw values in cells', () => {
    render(<TableChart data={tableData} />);
    expect(screen.getByText('2.87')).toBeInTheDocument();
    expect(screen.getByText('web_search')).toBeInTheDocument();
  });

  it('renders placeholder for empty data', () => {
    const empty: PanelData = { resultType: 'vector', result: [] };
    render(<TableChart data={empty} />);
    expect(screen.getByText('No data')).toBeInTheDocument();
  });

  it('handles multiple metric keys across rows', () => {
    const data: PanelData = {
      resultType: 'vector',
      result: [
        { metric: { a: '1', b: '2' }, value: [NOW, '10'] },
        { metric: { a: '3', c: '4' }, value: [NOW, '20'] },
      ] as VectorResult[],
    };
    render(<TableChart data={data} />);
    // Should have columns: a, b, c, Value
    expect(screen.getByText('a')).toBeInTheDocument();
    expect(screen.getByText('b')).toBeInTheDocument();
    expect(screen.getByText('c')).toBeInTheDocument();
  });
});
