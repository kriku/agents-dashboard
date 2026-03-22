import type { Panel } from '@agent-monitor/shared';
import { TimeSeriesChart } from './TimeSeriesChart';
import { StatChart } from './StatChart';
import { GaugeChart } from './GaugeChart';
import { HeatmapChart } from './HeatmapChart';
import { BarChart } from './BarChart';
import { TableChart } from './TableChart';

interface PanelRendererProps {
  panel: Panel;
}

export function PanelRenderer({ panel }: PanelRendererProps) {
  switch (panel.type) {
    case 'timeseries':
      return (
        <TimeSeriesChart
          data={panel.data}
          unit={panel.unit}
          thresholds={panel.thresholds}
          annotations={panel.annotations}
        />
      );
    case 'stat':
      return (
        <StatChart
          data={panel.data}
          unit={panel.unit}
          title={panel.title}
          subtitle={panel.subtitle}
          subtitleColor={panel.subtitleColor}
          valueColor={panel.valueColor}
          displayValue={panel.displayValue}
        />
      );
    case 'gauge':
      return <GaugeChart data={panel.data} unit={panel.unit} />;
    case 'heatmap':
      return <HeatmapChart data={panel.data} />;
    case 'bar':
      return <BarChart data={panel.data} unit={panel.unit} />;
    case 'table':
      return <TableChart data={panel.data} />;
    default: {
      const _exhaustive: never = panel.type;
      return <div className="panel-unsupported">Unsupported panel type: {_exhaustive}</div>;
    }
  }
}
