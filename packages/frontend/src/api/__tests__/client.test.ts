import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiFetch, ApiError } from '../client';

describe('apiFetch', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('injects Authorization header when token exists', async () => {
    localStorage.setItem('auth_token', 'test-jwt');
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: 1 }),
    });
    await apiFetch('/api/test');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer test-jwt' }),
      }),
    );
  });

  it('omits Authorization header when no token', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });
    await apiFetch('/api/test');
    const callHeaders = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]![1].headers;
    expect(callHeaders).not.toHaveProperty('Authorization');
  });

  it('includes Content-Type application/json', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });
    await apiFetch('/api/test');
    const callHeaders = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]![1].headers;
    expect(callHeaders['Content-Type']).toBe('application/json');
  });

  it('returns parsed JSON on success', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ value: 42 }),
    });
    const result = await apiFetch<{ value: number }>('/api/test');
    expect(result.value).toBe(42);
  });

  it('throws ApiError with status 401', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
    });
    await expect(apiFetch('/api/test')).rejects.toThrow(ApiError);
    await expect(apiFetch('/api/test')).rejects.toMatchObject({ status: 401 });
  });

  it('throws ApiError with status 404', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });
    await expect(apiFetch('/api/test')).rejects.toMatchObject({ status: 404 });
  });

  it('throws ApiError with status 500', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });
    await expect(apiFetch('/api/test')).rejects.toMatchObject({ status: 500 });
  });

  it('propagates network errors', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(apiFetch('/api/test')).rejects.toThrow('Failed to fetch');
  });
});
