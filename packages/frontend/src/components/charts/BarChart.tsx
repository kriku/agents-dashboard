import type { PanelData, PanelUnit, VectorResult } from '@agent-monitor/shared';
import { formatValue } from '../../utils/formatters';

const COLORS = ['#534AB7', '#1D9E75', '#D85A30', '#BA7517', '#D4537E', '#2E86C1', '#7D3C98', '#1ABC9C'];

interface BarChartProps {
  data: PanelData;
  unit: PanelUnit;
}

export function BarChart({ data, unit }: BarChartProps) {
  if (data.resultType !== 'vector' || data.result.length === 0) {
    return <div className="chart-empty">No data</div>;
  }

  const results = data.result as VectorResult[];
  const values = results.map((r) => Number(r.value[1]));
  const maxValue = Math.max(...values);

  return (
    <div className="bar-chart">
      {results.map((r, i) => {
        const label = Object.values(r.metric).join(' ');
        const val = values[i] ?? 0;
        const pct = maxValue > 0 ? (val / maxValue) * 100 : 0;

        return (
          <div className="bar-chart__row" key={i}>
            <span className="bar-chart__label">{label}</span>
            <div className="bar-chart__track">
              <div
                className="bar-chart__fill"
                style={{ width: `${pct}%`, background: COLORS[i % COLORS.length] }}
              />
            </div>
            <span className="bar-chart__value">{formatValue(val, unit)}</span>
          </div>
        );
      })}
    </div>
  );
}
