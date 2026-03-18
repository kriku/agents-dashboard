import type { Panel } from '../../types/views';
import { PanelRenderer } from '../charts/PanelRenderer';

interface PanelCardProps {
  panelId: string;
  panels: Panel[] | undefined;
  loading: boolean;
}

export function PanelCard({ panelId, panels, loading }: PanelCardProps) {
  const panel = panels?.find((p) => p.id === panelId);

  if (loading || !panel) {
    return (
      <div className="panel-card panel-card--loading">
        <div className="panel-card__title">{panelId}</div>
        <div className="panel-card__skeleton" />
      </div>
    );
  }

  return (
    <div className="panel-card" data-panel-id={panelId} data-panel-type={panel.type}>
      {panel.type !== 'stat' && <div className="panel-card__title">{panel.title}</div>}
      <div className="panel-card__body">
        <PanelRenderer panel={panel} />
      </div>
    </div>
  );
}
