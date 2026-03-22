import { ViewPage } from '../components/layout/ViewPage';

const LAYOUT = [
  ['active_agents', 'total_invocations_24h', 'error_rate_current', 'p95_latency_current'],
  ['invocation_rate', 'error_rate'],
  ['errors_by_type', 'p95_latency'],
  ['step_distribution', 'guardrail_pass_fail'],
];

export function AgentOverview() {
  return <ViewPage viewId="agent-overview" layout={LAYOUT} />;
}
