"use client";

import { useQuery } from "@tanstack/react-query";

interface UsePollingOptions<T> {
  queryKey: string[];
  queryFn: () => Promise<T>;
  enabled?: boolean;
  intervalMs: number;
  staleTime?: number;
  retry?: boolean | number;
}

export function usePolling<T>({
  queryKey,
  queryFn,
  enabled = true,
  intervalMs,
  staleTime,
  retry = false,
}: UsePollingOptions<T>) {
  return useQuery({
    queryKey,
    queryFn,
    enabled,
    refetchInterval: enabled ? intervalMs : false,
    staleTime: staleTime ?? Math.min(intervalMs / 2, 2000),
    retry,
  });
}
