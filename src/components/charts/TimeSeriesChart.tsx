import { useRef, useState, useEffect, useMemo } from 'react';
import UplotReact from 'uplot-react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import type { PanelData, PanelUnit, MatrixResult, Threshold, Annotation } from '../../types/views';
import { formatValue } from '../../utils/formatters';

const COLORS = ['#534AB7', '#1D9E75', '#D85A30', '#BA7517', '#D4537E', '#2E86C1', '#7D3C98', '#1ABC9C'];

const OVERLAY_COLORS: Record<string, string> = {
  danger: '#E24B4A',
  warning: '#BA7517',
  success: '#1D9E75',
};

interface TimeSeriesChartProps {
  data: PanelData;
  unit: PanelUnit;
  thresholds?: Threshold[];
  annotations?: Annotation[];
}

function overlaysPlugin(
  thresholds: Threshold[] | undefined,
  annotations: Annotation[] | undefined,
): uPlot.Plugin {
  return {
    hooks: {
      draw: [
        (u: uPlot) => {
          const ctx = u.ctx;
          const { left, top, width, height } = u.bbox;

          ctx.save();

          // Draw thresholds
          if (thresholds) {
            for (const th of thresholds) {
              const yPos = u.valToPos(th.value, 'y', true);
              if (yPos < top || yPos > top + height) continue;

              const color = OVERLAY_COLORS[th.color ?? 'warning'] ?? OVERLAY_COLORS.warning!;

              ctx.strokeStyle = color;
              ctx.lineWidth = 2;
              ctx.setLineDash([8, 5]);
              ctx.globalAlpha = 0.8;
              ctx.beginPath();
              ctx.moveTo(left, yPos);
              ctx.lineTo(left + width, yPos);
              ctx.stroke();
              ctx.setLineDash([]);

              // Label
              ctx.globalAlpha = 1;
              ctx.font = 'bold 24px sans-serif';
              ctx.fillStyle = color;
              ctx.fillText(th.label, left + width, yPos - 16);
            }
          }

          // Draw annotations (spike markers)
          if (annotations) {
            for (const ann of annotations) {
              const xPos = u.valToPos(ann.timestamp, 'x', true);
              const yPos = u.valToPos(ann.value, 'y', true);
              if (
                xPos < left || xPos > left + width ||
                yPos < top || yPos > top + height
              ) continue;

              const color = OVERLAY_COLORS[ann.color ?? 'danger'] ?? OVERLAY_COLORS.danger!;

              // Circle
              ctx.globalAlpha = 1;
              ctx.strokeStyle = color;
              ctx.lineWidth = 2.5;
              ctx.beginPath();
              ctx.arc(xPos, yPos, 6, 0, Math.PI * 2);
              ctx.stroke();

              // Label
              ctx.font = 'bold 24px sans-serif';
              ctx.fillStyle = color;
              ctx.fillText(ann.label, xPos, yPos + 16);
            }
          }

          ctx.restore();
        },
      ],
    },
  };
}

export function TimeSeriesChart({ data, unit, thresholds, annotations }: TimeSeriesChartProps) {
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

  const plugin = useMemo(
    () => overlaysPlugin(thresholds, annotations),
    [thresholds, annotations],
  );

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
    plugins: [plugin],
    scales: {
      x: { time: true },
    },
    axes: [
      {},
      {
        size(self, values) {
          if (!values) return 40;
          const maxLabel = values.reduce((a, b) => (a.length > b.length ? a : b), "");
          const ctx = self.ctx;
          return ctx.measureText(maxLabel).width + 24;
        },
        values: (_self, ticks) => ticks.map((v) => formatValue(v, unit)),
      },
    ],
    series: [
      {},
      ...series.map((s, i) => ({
        label: Object.values(s.metric).join(' ') || `Series ${i + 1}`,
        stroke: COLORS[i % COLORS.length]!,
        width: 1.5,
        value: (_self: uPlot, rawValue: number) => rawValue == null ? '--' : formatValue(rawValue, unit),
      })),
    ],
  };

  return (
    <div className="chart-container" ref={containerRef}>
      {width > 0 && <UplotReact options={opts} data={uplotData} />}
    </div>
  );
}
