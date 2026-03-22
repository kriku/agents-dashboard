import { ViewPage } from '../components/layout/ViewPage';

const LAYOUT = [
  ['total_tokens_24h', 'token_rate', 'estimated_cost_24h', 'avg_tokens_per_invocation'],
  ['token_rate_by_model', 'prompt_vs_completion'],
  ['cost_by_model', 'top_token_consumers'],
];

export function LLMTokenUsage() {
  return <ViewPage viewId="llm-token-usage" layout={LAYOUT} />;
}
