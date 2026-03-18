import { BrowserRouter, Routes, Route } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppShell } from './components/layout/AppShell';
import { AgentOverview } from './pages/AgentOverview';
import { ToolCallPerformance } from './pages/ToolCallPerformance';
import { LLMTokenUsage } from './pages/LLMTokenUsage';
import { ErrorBreakdown } from './pages/ErrorBreakdown';
import { CostTracking } from './pages/CostTracking';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<AgentOverview />} />
            <Route path="tool-call-performance" element={<ToolCallPerformance />} />
            <Route path="llm-token-usage" element={<LLMTokenUsage />} />
            <Route path="error-breakdown" element={<ErrorBreakdown />} />
            <Route path="cost-tracking" element={<CostTracking />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
