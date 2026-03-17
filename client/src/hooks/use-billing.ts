/**
 * use-billing.ts
 *
 * Handles Stripe checkout and customer portal navigation.
 * API calls go to the same endpoint in both dev (Express) and prod (Worker).
 * STRIPE_SECRET_KEY is server-only — never exposed to this file or the browser.
 */

import { useState } from "react";
import { apiRequest } from "@/lib/queryClient";

export function useBilling() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Redirect to Stripe Checkout to subscribe ($3/month) */
  async function startCheckout() {
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiRequest("POST", "/api/billing/checkout", {});
      const { url } = await res.json();
      if (url) window.location.href = url;
    } catch (e: any) {
      setError("Could not start checkout. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  /** Redirect to Stripe Customer Portal (manage / cancel subscription) */
  async function openPortal() {
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiRequest("POST", "/api/billing/portal", {});
      const { url } = await res.json();
      if (url) window.location.href = url;
    } catch (e: any) {
      setError("Could not open billing portal. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  return { startCheckout, openPortal, isLoading, error };
}
