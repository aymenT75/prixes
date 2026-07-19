import { useQuery, type UseQueryOptions, type UseQueryResult } from "@tanstack/react-query";

/**
 * Wrapper around useQuery that ensures errors are properly handled.
 * Returns both data and error state so components can render error UI.
 */
export function useApiQuery<T>(
  options: UseQueryOptions<T, Error, T>
): UseQueryResult<T, Error> {
  return useQuery<T, Error>({
    ...options,
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30000),
  });
}
