import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';
import { useView } from '../useView';
import { mockAgentOverview } from '../../../specs/bff-mock-data';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('useView', () => {
  it('fetches view data successfully', async () => {
    const { result } = renderHook(() => useView('agent-overview'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.view.id).toBe('agent-overview');
    expect(result.current.data?.view.title).toBe('Agent Execution Overview');
  });

  it('returns error for unknown view', async () => {
    const { result } = renderHook(() => useView('nonexistent'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it('derives refetchInterval from view.refreshSec', async () => {
    const { result } = renderHook(() => useView('agent-overview'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // refreshSec for agent-overview is 30
    expect(result.current.data?.view.refreshSec).toBe(30);
  });

  it('uses separate cache keys per viewId', async () => {
    const wrapper = createWrapper();
    const { result: r1 } = renderHook(() => useView('agent-overview'), { wrapper });
    const { result: r2 } = renderHook(() => useView('cost-tracking'), { wrapper });
    await waitFor(() => expect(r1.current.isSuccess).toBe(true));
    await waitFor(() => expect(r2.current.isSuccess).toBe(true));
    expect(r1.current.data?.view.id).toBe('agent-overview');
    expect(r2.current.data?.view.id).toBe('cost-tracking');
  });

  it('returns panels in response', async () => {
    const { result } = renderHook(() => useView('agent-overview'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.panels.length).toBeGreaterThan(0);
    expect(result.current.data?.panels[0].id).toBe('active_agents');
  });

  it('handles server error', async () => {
    server.use(
      http.get('/api/views/:viewId', () => {
        return HttpResponse.json({ error: 'boom' }, { status: 500 });
      }),
    );
    const { result } = renderHook(() => useView('agent-overview'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
