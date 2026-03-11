import { useQuery } from "@tanstack/react-query";

export function useWeeklyAnalytics() {
  return useQuery({
    queryKey: ["/api/analytics/weekly"],
    queryFn: async () => {
      const res = await fetch("/api/analytics/weekly", { credentials: "include" });
      if (res.status === 402) throw Object.assign(new Error("upgrade_required"), { status: 402 });
      if (!res.ok) throw new Error("Failed to fetch weekly analytics");
      return res.json();
    },
    retry: false,
  });
}

export function useDailyAnalytics(days = 30) {
  return useQuery({
    queryKey: ["/api/analytics/daily", days],
    queryFn: async () => {
      const res = await fetch(`/api/analytics/daily?days=${days}`, { credentials: "include" });
      if (res.status === 402) throw Object.assign(new Error("upgrade_required"), { status: 402 });
      if (!res.ok) throw new Error("Failed to fetch daily analytics");
      return res.json();
    },
    retry: false,
  });
}

export function useCategoryBreakdown() {
  return useQuery({
    queryKey: ["/api/analytics/categories"],
    queryFn: async () => {
      const res = await fetch("/api/analytics/categories", { credentials: "include" });
      if (res.status === 402) throw Object.assign(new Error("upgrade_required"), { status: 402 });
      if (!res.ok) throw new Error("Failed to fetch category breakdown");
      return res.json();
    },
    retry: false,
  });
}

export function useLeaderboard() {
  return useQuery({
    queryKey: ["/api/leaderboard"],
    queryFn: async () => {
      const res = await fetch("/api/leaderboard", { credentials: "include" });
      if (res.status === 402) throw Object.assign(new Error("upgrade_required"), { status: 402 });
      if (!res.ok) throw new Error("Failed to fetch leaderboard");
      return res.json();
    },
    retry: false,
  });
}
