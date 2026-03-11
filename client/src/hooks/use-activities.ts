import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/routes";

export function useActivitySessions() {
  return useQuery({
    queryKey: [api.activitySessions.list.path],
    queryFn: async () => {
      const res = await fetch(api.activitySessions.list.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch activity sessions");
      return res.json();
    },
  });
}

export function useCreateActivitySession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      categoryId: number;
      startTime: string;
      endTime: string;
      durationMinutes: number;
    }) => {
      const res = await fetch(api.activitySessions.create.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to create activity session");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.activitySessions.list.path] });
    },
  });
}
