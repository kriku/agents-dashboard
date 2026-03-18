import ReactECharts from 'echarts-for-react';
import type { PanelData, PanelUnit, VectorResult } from '../../types/views';
import { formatValue } from '../../utils/formatters';

interface GaugeChartProps {
  data: PanelData;
  unit: PanelUnit;
}

export function GaugeChart({ data, unit }: GaugeChartProps) {
  if (data.resultType !== 'vector' || data.result.length === 0) {
    return <div className="chart-empty">No data</div>;
  }

  const result = data.result[0] as VectorResult;
  const value = Number(result.value[1]);

  const option = {
    series: [
      {
        type: 'gauge',
        detail: {
          formatter: () => formatValue(value, unit),
          fontSize: 16,
        },
        data: [{ value }],
        max: unit === 'percent' ? 100 : undefined,
      },
    ],
  };

  return <ReactECharts option={option} style={{ height: 200 }} />;
}
