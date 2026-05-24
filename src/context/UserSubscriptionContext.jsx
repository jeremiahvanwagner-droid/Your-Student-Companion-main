import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { fetchMySubscription } from "@/components/store/subscriptionApi";

const UserSubscriptionContext = createContext(null);

const ACTIVE_STATUSES = new Set(["active", "trialing"]);

export function UserSubscriptionProvider({ children }) {
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await fetchMySubscription();
      setSubscription(result || null);
    } catch (err) {
      setError(err?.message || "Failed to load subscription.");
      setSubscription(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const value = useMemo(() => {
    const status = subscription?.status || null;
    const tier = subscription?.tier || null;
    const degreePlanId = subscription?.degree_plan_id ?? null;

    return {
      subscription,
      loading,
      error,
      refresh,
      isActive: ACTIVE_STATUSES.has(status),
      isTrialing: status === "trialing",
      tier,
      degreePlanId,
    };
  }, [subscription, loading, error, refresh]);

  return (
    <UserSubscriptionContext.Provider value={value}>{children}</UserSubscriptionContext.Provider>
  );
}

export function useUserSubscriptionContext() {
  const context = useContext(UserSubscriptionContext);

  if (!context) {
    throw new Error("useUserSubscriptionContext must be used inside UserSubscriptionProvider.");
  }

  return context;
}
