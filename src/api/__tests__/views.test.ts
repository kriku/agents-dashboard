import { describe, it, expect, vi } from 'vitest';

vi.mock('../client', () => ({
  apiFetch: vi.fn(),
  ApiError: class extends Error {
    status: number;
    constructor(status: number, msg: string) {
      super(msg);
      this.status = status;
    }
  },
}));

import { fetchViewList, fetchView, fetchPanel } from '../views';
import { apiFetch } from '../client';

describe('fetchViewList', () => {
  it('calls GET /api/views', async () => {
    const mockList = [{ id: 'v1', title: 'V1', description: '' }];
    vi.mocked(apiFetch).mockResolvedValue(mockList);
    const result = await fetchViewList();
    expect(apiFetch).toHaveBeenCalledWith('/api/views');
    expect(result).toEqual(mockList);
  });
});

describe('fetchView', () => {
  it('calls GET /api/views/{viewId}', async () => {
    const mockView = { view: { id: 'x' }, panels: [] };
    vi.mocked(apiFetch).mockResolvedValue(mockView);
    const result = await fetchView('agent-overview');
    expect(apiFetch).toHaveBeenCalledWith('/api/views/agent-overview');
    expect(result).toEqual(mockView);
  });

  it('propagates errors', async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error('fail'));
    await expect(fetchView('bad')).rejects.toThrow('fail');
  });
});

describe('fetchPanel', () => {
  it('calls GET /api/views/{viewId}/panels/{panelId}', async () => {
    const mockPanel = { id: 'p1', title: 'P1', type: 'stat' };
    vi.mocked(apiFetch).mockResolvedValue(mockPanel);
    const result = await fetchPanel('agent-overview', 'active_agents');
    expect(apiFetch).toHaveBeenCalledWith('/api/views/agent-overview/panels/active_agents');
    expect(result).toEqual(mockPanel);
  });

  it('propagates errors', async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error('not found'));
    await expect(fetchPanel('x', 'y')).rejects.toThrow('not found');
  });
});
