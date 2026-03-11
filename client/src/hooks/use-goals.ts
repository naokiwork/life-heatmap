import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export function useGoals() {
  return useQuery({
    queryKey: ["/api/goals"],
    queryFn: async () => {
      const res = await fetch("/api/goals", { credentials: "include" });
      if (res.status === 402) throw Object.assign(new Error("upgrade_required"), { status: 402 });
      if (!res.ok) throw new Error("Failed to fetch goals");
      return res.json();
    },
    retry: false,
  });
}

export function useCreateGoal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      name: string;
      categoryId?: number | null;
      targetMinutes: number;
      deadline?: string | null;
    }) => {
      const res = await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to create goal");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/goals"] }),
  });
}

export function useDeleteGoal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await fetch(`/api/goals/${id}`, { method: "DELETE", credentials: "include" });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/goals"] }),
  });
}
