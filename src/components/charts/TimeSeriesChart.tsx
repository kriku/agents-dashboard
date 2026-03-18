import { useRef, useState, useEffect } from 'react';
import UplotReact from 'uplot-react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import type { PanelData, PanelUnit, MatrixResult } from '../../types/views';
import { formatValue } from '../../utils/formatters';

const COLORS = ['#534AB7', '#1D9E75', '#D85A30', '#BA7517', '#D4537E', '#2E86C1', '#7D3C98', '#1ABC9C'];

interface TimeSeriesChartProps {
  data: PanelData;
  unit: PanelUnit;
}

export function TimeSeriesChart({ data, unit }: TimeSeriesChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      if (w > 0) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (data.resultType !== 'matrix' || data.result.length === 0) {
    return <div className="chart-empty">No data</div>;
  }

  const series = data.result as MatrixResult[];
  const timestamps = series[0]!.values.map(([t]) => t);

  const uplotData: uPlot.AlignedData = [
    timestamps,
    ...series.map((s) => s.values.map(([, v]) => Number(v))),
  ];

  const opts: uPlot.Options = {
    width,
    height: 240,
    cursor: { show: true },
    scales: {
      x: { time: true },
    },
    axes: [
      {},
      {
        values: (_self, ticks) => ticks.map((v) => formatValue(v, unit)),
      },
    ],
    series: [
      {},
      ...series.map((s, i) => ({
        label: Object.values(s.metric).join(' ') || `Series ${i + 1}`,
        stroke: COLORS[i % COLORS.length]!,
        width: 1.5,
      })),
    ],
  };

  return (
    <div className="chart-container" ref={containerRef}>
      {width > 0 && <UplotReact options={opts} data={uplotData} />}
    </div>
  );
}
