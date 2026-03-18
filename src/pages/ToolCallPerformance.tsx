import { ViewPage } from '../components/layout/ViewPage';

const LAYOUT = [
  ['total_tool_calls_24h', 'tool_error_rate_current', 'p50_tool_latency_current', 'p99_tool_latency_current'],
  ['tool_latency_percentiles', 'latency_by_tool'],
  ['call_frequency', 'tool_error_rates'],
  ['slowest_tools'],
];

export function ToolCallPerformance() {
  return <ViewPage viewId="tool-call-performance" layout={LAYOUT} />;
}
