// =============================================================================
// FE-026, FE-027: Auto-refresh polling scenarios from test spec
// =============================================================================

import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';
import { useView } from '../useView';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
}

afterEach(() => {
  vi.useRealTimers();
});

// FE-026: Agent overview polls every 30 seconds
describe('FE-026: auto-refresh interval', () => {
  it('agent-overview has refreshSec=30', async () => {
    const { result } = renderHook(() => useView('agent-overview'), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.view.refreshSec).toBe(30);
  });

  it('cost-tracking has refreshSec=300', async () => {
    const { result } = renderHook(() => useView('cost-tracking'), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.view.refreshSec).toBe(300);
  });

  it('llm-token-usage has refreshSec=60', async () => {
    const { result } = renderHook(() => useView('llm-token-usage'), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.view.refreshSec).toBe(60);
  });
});

// FE-027: Cost tracking polls less frequently than agent overview
describe('FE-027: different views have different refresh intervals', () => {
  it('cost-tracking refreshSec (300) > agent-overview refreshSec (30)', async () => {
    const wrapper = createWrapper();
    const { result: agentResult } = renderHook(() => useView('agent-overview'), { wrapper });
    const { result: costResult } = renderHook(() => useView('cost-tracking'), { wrapper });

    await waitFor(() => expect(agentResult.current.isSuccess).toBe(true));
    await waitFor(() => expect(costResult.current.isSuccess).toBe(true));

    const agentRefresh = agentResult.current.data!.view.refreshSec;
    const costRefresh = costResult.current.data!.view.refreshSec;
    expect(costRefresh).toBeGreaterThan(agentRefresh);
  });

  it('refetchInterval is derived from refreshSec * 1000', async () => {
    let fetchCount = 0;
    server.use(
      http.get('*/api/views/agent-overview', () => {
        fetchCount++;
        return HttpResponse.json({
          view: { id: 'agent-overview', title: 'Test', description: '', refreshSec: 1 },
          panels: [],
        });
      }),
    );

    vi.useFakeTimers();
    const { result } = renderHook(() => useView('agent-overview'), {
      wrapper: createWrapper(),
    });

    // Wait for initial fetch
    await vi.waitFor(() => expect(result.current.isSuccess).toBe(true));
    const initialFetchCount = fetchCount;

    // Advance time by 1.5 seconds (refreshSec is 1)
    await vi.advanceTimersByTimeAsync(1500);

    // Should have refetched at least once
    expect(fetchCount).toBeGreaterThan(initialFetchCount);
  });
});
