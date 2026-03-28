import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, type RenderHookOptions } from "@testing-library/react";
import type { ReactNode } from "react";
import React from "react";

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

function createWrapper() {
  const queryClient = createTestQueryClient();
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

export function renderHookWithProviders<TResult, TProps>(
  hook: (props: TProps) => TResult,
  options?: Omit<RenderHookOptions<TProps>, "wrapper">,
) {
  return renderHook(hook, {
    wrapper: createWrapper(),
    ...options,
  });
}

export { createTestQueryClient, createWrapper };
