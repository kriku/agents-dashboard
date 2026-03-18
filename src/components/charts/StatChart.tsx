import type { PanelData, PanelUnit, VectorResult } from '../../types/views';
import { formatValue } from '../../utils/formatters';

interface StatChartProps {
  data: PanelData;
  unit: PanelUnit;
}

export function StatChart({ data, unit }: StatChartProps) {
  if (data.resultType !== 'vector' || data.result.length === 0) {
    return <div className="stat-empty">--</div>;
  }

  const result = data.result[0] as VectorResult;
  const value = Number(result.value[1]);
  const label = Object.values(result.metric).join(' ');

  return (
    <div className="stat-chart">
      <div className="stat-value">{formatValue(value, unit)}</div>
      {label && <div className="stat-label">{label}</div>}
    </div>
  );
}
