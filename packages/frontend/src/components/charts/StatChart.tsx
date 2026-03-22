import type { PanelData, PanelUnit, VectorResult } from '@agent-monitor/shared';
import { formatValue } from '../../utils/formatters';

interface StatChartProps {
  data: PanelData;
  unit: PanelUnit;
  title?: string;
  subtitle?: string;
  subtitleColor?: 'success' | 'danger' | 'warning' | 'muted';
  valueColor?: 'success' | 'danger' | 'warning';
  displayValue?: string;
}

export function StatChart({ data, unit, title, subtitle, subtitleColor, valueColor, displayValue }: StatChartProps) {
  if (data.resultType !== 'vector' || data.result.length === 0) {
    return <div className="stat-empty">--</div>;
  }

  const result = data.result[0] as VectorResult;
  const rawValue = result.value[1];
  const numValue = Number(rawValue);
  const label = title || Object.values(result.metric).join(' ');

  const formattedValue = displayValue ?? (isNaN(numValue) ? rawValue : formatValue(numValue, unit));

  const valueClasses = [
    'stat-value',
    valueColor && `stat-value--${valueColor}`,
    displayValue && 'stat-value--small',
  ].filter(Boolean).join(' ');

  return (
    <div className="stat-chart">
      {label && <div className="stat-label">{label}</div>}
      <div className={valueClasses}>{formattedValue}</div>
      {subtitle && (
        <div className={`stat-subtitle${subtitleColor ? ` stat-subtitle--${subtitleColor}` : ''}`}>
          {subtitle}
        </div>
      )}
    </div>
  );
}
