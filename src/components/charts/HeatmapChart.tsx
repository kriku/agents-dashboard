import ReactECharts from 'echarts-for-react';
import type { PanelData, MatrixResult } from '../../types/views';

interface HeatmapChartProps {
  data: PanelData;
}

export function HeatmapChart({ data }: HeatmapChartProps) {
  if (data.resultType !== 'matrix' || data.result.length === 0) {
    return <div className="chart-empty">No data</div>;
  }

  const series = data.result as MatrixResult[];
  const yLabels = series.map((s) => s.metric['le'] ?? Object.values(s.metric).join(' '));

  // Sample timestamps for x-axis (use every Nth point to avoid clutter)
  const timestamps = series[0]!.values.map(([t]) => {
    const d = new Date(t * 1000);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  });

  // Build heatmap data: [xIndex, yIndex, value]
  const heatmapData: [number, number, number][] = [];
  series.forEach((s, yIdx) => {
    s.values.forEach(([, v], xIdx) => {
      heatmapData.push([xIdx, yIdx, Number(v)]);
    });
  });

  const option = {
    tooltip: { position: 'top' },
    grid: { left: 60, right: 20, top: 10, bottom: 40 },
    xAxis: {
      type: 'category' as const,
      data: timestamps,
      splitArea: { show: true },
    },
    yAxis: {
      type: 'category' as const,
      data: yLabels,
    },
    visualMap: {
      min: 0,
      max: Math.max(...heatmapData.map(([, , v]) => v)),
      calculable: true,
      orient: 'horizontal' as const,
      left: 'center',
      bottom: 0,
      inRange: { color: ['#f0f0ff', '#534AB7'] },
    },
    series: [
      {
        type: 'heatmap',
        data: heatmapData,
        emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.5)' } },
      },
    ],
  };

  return <ReactECharts option={option} style={{ height: 280 }} />;
}
