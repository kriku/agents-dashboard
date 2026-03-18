import type { PanelData, PanelUnit, VectorResult } from '../../types/views';
import { formatValue } from '../../utils/formatters';

interface StatChartProps {
  data: PanelData;
  unit: PanelUnit;
  title?: string;
}

export function StatChart({ data, unit, title }: StatChartProps) {
  if (data.resultType !== 'vector' || data.result.length === 0) {
    return <div className="stat-empty">--</div>;
  }

  const result = data.result[0] as VectorResult;
  const value = Number(result.value[1]);
  const label = title || Object.values(result.metric).join(' ');

  return (
    <div className="stat-chart">
      {label && <div className="stat-label">{label}</div>}
      <div className="stat-value">{formatValue(value, unit)}</div>
    </div>
  );
}
