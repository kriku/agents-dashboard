import { ViewPage } from '../components/layout/ViewPage';

const LAYOUT = [
  ['active_tools', 'total_tool_calls_24h', 'tool_error_rate_current', 'retry_rate'],
  ['tool_latency_percentiles', 'tool_error_rates'],
  ['retry_rate_by_tool', 'slowest_tools'],
];

export function ToolCallPerformance() {
  return <ViewPage viewId="tool-call-performance" layout={LAYOUT} />;
}
