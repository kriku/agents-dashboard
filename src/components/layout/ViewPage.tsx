import { useView } from '../../hooks/useView';
import { PanelCard } from './PanelCard';

interface ViewPageProps {
  viewId: string;
  /** Panel IDs grouped by row. Each inner array is one grid row. */
  layout: string[][];
}

export function ViewPage({ viewId, layout }: ViewPageProps) {
  const { data, isLoading, error } = useView(viewId);

  if (error) {
    return (
      <div className="view-page view-page--error">
        <h1>Error loading view</h1>
        <p>{error.message}</p>
      </div>
    );
  }

  return (
    <div className="view-page">
      <div className="view-page__header">
        <h1>{data?.view.title ?? viewId}</h1>
        {data?.view.description && <p>{data.view.description}</p>}
        {data?.view.refreshSec && (
          <span className="view-page__refresh">
            Refreshes every {data.view.refreshSec}s
          </span>
        )}
      </div>
      <div className="view-page__grid">
        {layout.map((row, rowIdx) => (
          <div key={rowIdx} className="view-page__row" data-cols={row.length}>
            {row.map((panelId) => (
              <PanelCard
                key={panelId}
                panelId={panelId}
                panels={data?.panels}
                loading={isLoading}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
