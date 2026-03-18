import { ViewPage } from '../components/layout/ViewPage';

const LAYOUT = [
  ['total_tokens_24h', 'input_tokens_24h', 'output_tokens_24h', 'avg_llm_latency_5m'],
  ['token_rate_by_model', 'prompt_vs_completion'],
  ['llm_latency_by_model', 'cost_by_model'],
  ['top_token_consumers'],
];

export function LLMTokenUsage() {
  return <ViewPage viewId="llm-token-usage" layout={LAYOUT} />;
}
