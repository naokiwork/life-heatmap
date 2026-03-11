import { useQuery } from "@tanstack/react-query";
import { api } from "@shared/routes";

export function useInsights() {
  return useQuery({
    queryKey: [api.insights.get.path],
    queryFn: async () => {
      const res = await fetch(api.insights.get.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch insights");
      return res.json();
    },
    retry: false, // Don't block UI if AI insights aren't available yet
  });
}
