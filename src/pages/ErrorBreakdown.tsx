import { ViewPage } from '../components/layout/ViewPage';

const LAYOUT = [
  ['total_errors_24h', 'error_rate_overall', 'most_common_error'],
  ['error_rate_trend', 'errors_by_type'],
  ['errors_by_agent', 'top_error_messages'],
];

export function ErrorBreakdown() {
  return <ViewPage viewId="error-breakdown" layout={LAYOUT} />;
}
