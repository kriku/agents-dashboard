import ReactECharts from 'echarts-for-react';
import type { PanelData, PanelUnit, VectorResult } from '../../types/views';
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
  const categories = results.map((r) => Object.values(r.metric).join(' '));
  const values = results.map((r) => Number(r.value[1]));

  const option = {
    tooltip: {
      trigger: 'axis' as const,
      formatter: (params: Array<{ name: string; value: number }>) => {
        const p = params[0];
        return p ? `${p.name}: ${formatValue(p.value, unit)}` : '';
      },
    },
    grid: { left: 100, right: 20, top: 10, bottom: 30 },
    xAxis: { type: 'value' as const },
    yAxis: {
      type: 'category' as const,
      data: categories,
      inverse: true,
    },
    series: [
      {
        type: 'bar',
        data: values.map((v, i) => ({
          value: v,
          itemStyle: { color: COLORS[i % COLORS.length] },
        })),
      },
    ],
  };

  return <ReactECharts option={option} style={{ height: Math.max(200, results.length * 40) }} />;
}
