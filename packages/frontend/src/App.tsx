import { BrowserRouter, Routes, Route } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WorkspaceProvider } from './contexts/WorkspaceContext';
import { AppShell } from './components/layout/AppShell';
import { RequireAuth } from './components/auth/RequireAuth';
import { Login } from './pages/Login';
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
      <WorkspaceProvider>
        <BrowserRouter basename={import.meta.env.BASE_URL}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route element={<RequireAuth />}>
              <Route element={<AppShell />}>
                <Route index element={<AgentOverview />} />
                <Route path="tool-call-performance" element={<ToolCallPerformance />} />
                <Route path="llm-token-usage" element={<LLMTokenUsage />} />
                <Route path="error-breakdown" element={<ErrorBreakdown />} />
                <Route path="cost-tracking" element={<CostTracking />} />
              </Route>
            </Route>
          </Routes>
        </BrowserRouter>
      </WorkspaceProvider>
    </QueryClientProvider>
  );
}
