import type { PanelData, VectorResult } from '@agent-monitor/shared';

interface TableChartProps {
  data: PanelData;
}

export function TableChart({ data }: TableChartProps) {
  if (data.resultType !== 'vector' || data.result.length === 0) {
    return <div className="chart-empty">No data</div>;
  }

  const results = data.result as VectorResult[];

  // Collect all unique metric keys for column headers
  const metricKeys = [
    ...new Set(results.flatMap((r) => Object.keys(r.metric))),
  ];

  return (
    <div className="table-chart">
      <table>
        <thead>
          <tr>
            {metricKeys.map((key) => (
              <th key={key}>{key}</th>
            ))}
            <th>Value</th>
          </tr>
        </thead>
        <tbody>
          {results.map((r, i) => (
            <tr key={i}>
              {metricKeys.map((key) => (
                <td key={key}>{r.metric[key] ?? ''}</td>
              ))}
              <td>{r.value[1]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
