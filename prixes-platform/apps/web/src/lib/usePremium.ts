import { useQuery } from "@tanstack/react-query";

import { api } from "./api";
import { useApp } from "./store";

/**
 * Whether the signed-in account is Premium. False while unknown or signed out:
 * the free version of a feature is always the safe default, never a locked door.
 */
export function usePremium(): boolean {
  const { user } = useApp();
  const { data } = useQuery({
    queryKey: ["billing"],
    queryFn: () => api.billingStatus(),
    enabled: !!user,
    staleTime: 60_000,
  });
  return !!data?.premium;
}
