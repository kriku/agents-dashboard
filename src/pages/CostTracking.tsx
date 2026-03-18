import { ViewPage } from '../components/layout/ViewPage';

const LAYOUT = [
  ['estimated_daily_cost', 'projected_monthly_cost', 'cost_per_invocation_avg', 'cost_change_vs_yesterday'],
  ['cost_trend', 'cost_per_invocation'],
  ['cost_by_agent', 'cost_by_model'],
];

export function CostTracking() {
  return <ViewPage viewId="cost-tracking" layout={LAYOUT} />;
}
