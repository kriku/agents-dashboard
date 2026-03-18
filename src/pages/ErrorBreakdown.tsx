import { ViewPage } from '../components/layout/ViewPage';

const LAYOUT = [
  ['total_errors_24h', 'error_rate_overall', 'most_common_error', 'worst_agent_error_rate'],
  ['error_rate_trend', 'errors_by_type_trend'],
  ['errors_by_agent', 'errors_by_stage'],
  ['errors_by_version', 'top_error_messages'],
];

export function ErrorBreakdown() {
  return <ViewPage viewId="error-breakdown" layout={LAYOUT} />;
}
