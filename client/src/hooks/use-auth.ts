/**
 * use-auth.ts
 *
 * Works in two modes:
 *   DEV  (Replit): cookie-based session via same-origin Express API
 *   PROD (Pages):  JWT stored in sessionStorage, API calls go to Worker
 *
 * The JWT is extracted from the URL fragment after the Worker OIDC callback
 * (see extractTokenFromFragment in queryClient.ts — called in main.tsx).
 *
 * Login / logout redirect to the correct endpoint for each environment.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { User } from "@shared/models/auth";
import { clearAuthToken, getAuthToken } from "@/lib/queryClient";

const API_BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");
const IS_PROD = API_BASE !== "";

// ─── Fetch current user ───────────────────────────────────────────────────────

async function fetchUser(): Promise<User | null> {
  const headers: Record<string, string> = {};

  if (IS_PROD) {
    const token = getAuthToken();
    if (!token) return null; // No token → not logged in
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(
    IS_PROD ? `${API_BASE}/api/auth/user` : "/api/auth/user",
    {
      headers,
      credentials: IS_PROD ? "omit" : "include",
    }
  );

  if (response.status === 401) return null;
  if (!response.ok) throw new Error(`${response.status}: ${response.statusText}`);
  return response.json();
}

// ─── Login / Logout ───────────────────────────────────────────────────────────

function login(): void {
  window.location.href = IS_PROD
    ? `${API_BASE}/api/login`
    : "/api/login";
}

function logout(): void {
  if (IS_PROD) {
    clearAuthToken();
    window.location.href = `${API_BASE}/api/logout`;
  } else {
    window.location.href = "/api/logout";
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAuth() {
  const queryClient = useQueryClient();

  const { data: user, isLoading } = useQuery<User | null>({
    queryKey: ["/api/auth/user"],
    queryFn: fetchUser,
    retry: false,
    staleTime: 1000 * 60 * 5,
  });

  const logoutMutation = useMutation({
    mutationFn: async () => { logout(); },
    onSuccess: () => {
      queryClient.setQueryData(["/api/auth/user"], null);
    },
  });

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    login,
    logout: logoutMutation.mutate,
    isLoggingOut: logoutMutation.isPending,
  };
}
