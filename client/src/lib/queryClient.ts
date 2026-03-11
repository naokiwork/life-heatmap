/**
 * queryClient.ts
 *
 * Works in two modes:
 *
 *  DEV (Replit):   VITE_API_URL is empty → calls go to same origin with cookies
 *  PROD (Pages):   VITE_API_URL = Worker URL → calls go cross-origin with JWT
 *
 * The JWT is stored in sessionStorage (cleared on tab close).
 * The key VITE_API_URL is the ONLY public env var exposed to the browser.
 * It contains no secrets — just the Worker's public URL.
 *
 * NEVER put API keys, service role keys, or JWT_SECRET in this file.
 */

import { QueryClient, QueryFunction } from "@tanstack/react-query";

// ─── Environment ──────────────────────────────────────────────────────────────

/** Public: the base URL of the Worker API. Empty in dev (same origin). */
const API_BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

const IS_PROD = API_BASE !== "";

// ─── JWT token management ─────────────────────────────────────────────────────

/** Returns the stored Bearer token for production cross-origin auth. */
export function getAuthToken(): string | null {
  return sessionStorage.getItem("app_token");
}

/** Stores the JWT (called after OIDC callback redirect). */
export function setAuthToken(token: string): void {
  sessionStorage.setItem("app_token", token);
}

/** Clears the JWT (on logout). */
export function clearAuthToken(): void {
  sessionStorage.removeItem("app_token");
}

// ─── Token extraction from URL fragment (set by Worker after OIDC callback) ──

/**
 * Call once on app startup.
 * If the Worker redirected here with #token=..., store it and clean the URL.
 */
export function extractTokenFromFragment(): void {
  if (!IS_PROD) return;
  const hash = window.location.hash;
  if (!hash.startsWith("#token=")) return;
  const token = hash.slice("#token=".length);
  if (token) {
    setAuthToken(token);
    // Remove the token from the URL so it doesn't linger in browser history
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
  }
}

// ─── Auth headers ─────────────────────────────────────────────────────────────

function buildHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = { ...extra };
  if (IS_PROD) {
    const token = getAuthToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

/** Prepend API_BASE if in production, otherwise return path as-is. */
function resolveUrl(path: string): string {
  if (!IS_PROD) return path;
  // path may be "/api/categories" or "/api/categories/1"
  return `${API_BASE}${path}`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown,
): Promise<Response> {
  const headers = buildHeaders(data ? { "Content-Type": "application/json" } : {});
  const res = await fetch(resolveUrl(url), {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    // credentials: "include" only in dev (cookies); in prod we use Bearer
    credentials: IS_PROD ? "omit" : "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";

export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    // queryKey[0] is the path string, subsequent segments are path params
    const path = Array.isArray(queryKey) ? queryKey.join("/") : String(queryKey);
    const headers = buildHeaders();

    const res = await fetch(resolveUrl(path), {
      headers,
      credentials: IS_PROD ? "omit" : "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
