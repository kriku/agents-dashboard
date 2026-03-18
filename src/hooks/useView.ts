import { useQuery } from '@tanstack/react-query';
import { fetchView } from '../api/views';

export function useView(viewId: string) {
  return useQuery({
    queryKey: ['view', viewId],
    queryFn: () => fetchView(viewId),
    refetchInterval: (query) =>
      (query.state.data?.view.refreshSec ?? 30) * 1000,
    staleTime: 10_000,
  });
}
