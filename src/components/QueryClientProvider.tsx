"use client";

import { QueryClient, QueryClientProvider as QCProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

export function QueryClientProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 2_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return <QCProvider client={queryClient}>{children}</QCProvider>;
}
