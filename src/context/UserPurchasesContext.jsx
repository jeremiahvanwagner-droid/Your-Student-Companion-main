import { createContext, useContext, useEffect, useMemo, useState } from "react";

import {
  getClerkClientUser,
  getGuestUserId,
  resolveAppUser,
} from "@/components/store/storeApi";
import { useUserSubscriptionContext } from "@/context/UserSubscriptionContext";
import useUserPurchases from "@/hooks/useUserPurchases";

const UserPurchasesContext = createContext(null);
const APP_USER_CACHE_PREFIX = "ysc_app_user_id_for_clerk_";

function getCachedUserId(clerkUserId) {
  if (!clerkUserId) {
    return null;
  }

  return localStorage.getItem(`${APP_USER_CACHE_PREFIX}${clerkUserId}`);
}

function setCachedUserId(clerkUserId, appUserId) {
  if (!clerkUserId || !appUserId) {
    return;
  }

  localStorage.setItem(`${APP_USER_CACHE_PREFIX}${clerkUserId}`, appUserId);
}

export function UserPurchasesProvider({ children }) {
  const [userId, setUserId] = useState(null);
  const [identityLoading, setIdentityLoading] = useState(true);
  const [identityError, setIdentityError] = useState(null);

  useEffect(() => {
    let isMounted = true;

    const resolveIdentity = async () => {
      setIdentityLoading(true);
      setIdentityError(null);

      const clerkUser = getClerkClientUser();
      if (!clerkUser?.id) {
        if (isMounted) {
          setUserId(getGuestUserId());
          setIdentityLoading(false);
        }
        return;
      }

      const cachedUserId = getCachedUserId(clerkUser.id);

      try {
        const result = await resolveAppUser({
          clerk_user_id: clerkUser.id,
          email: clerkUser.email,
          first_name: clerkUser.first_name,
          last_name: clerkUser.last_name,
        });

        const resolvedUserId = String(result?.user_id || "").trim();
        if (!resolvedUserId) {
          throw new Error("Backend did not return a valid user_id.");
        }

        if (!isMounted) {
          return;
        }

        setCachedUserId(clerkUser.id, resolvedUserId);
        setUserId(resolvedUserId);
      } catch (error) {
        if (!isMounted) {
          return;
        }

        if (cachedUserId) {
          setUserId(cachedUserId);
        } else {
          // Last-resort fallback for continuity while backend is unavailable.
          setUserId(clerkUser.id);
        }

        setIdentityError(error?.message || "Failed to resolve application user identity.");
      } finally {
        if (isMounted) {
          setIdentityLoading(false);
        }
      }
    };

    resolveIdentity();

    return () => {
      isMounted = false;
    };
  }, []);

  const { subscription } = useUserSubscriptionContext();

  const {
    purchases,
    loading: purchasesLoading,
    error: purchasesError,
    refresh,
    isPackUnlocked,
    unlockedPackIds,
  } = useUserPurchases(userId, subscription);

  const unlockedPackNames = useMemo(() => {
    const names = purchases
      .filter((row) => row?.status === "completed")
      .map((row) => row?.course_pack?.name)
      .filter(Boolean);

    return Array.from(new Set(names));
  }, [purchases]);

  const error = purchasesError || identityError;
  const loading = identityLoading || purchasesLoading;

  const value = useMemo(
    () => ({
      userId,
      purchases,
      loading,
      error,
      refresh,
      isPackUnlocked,
      unlockedPackIds,
      unlockedPackNames,
      identityLoading,
      identityError,
    }),
    [
      userId,
      purchases,
      loading,
      error,
      refresh,
      isPackUnlocked,
      unlockedPackIds,
      unlockedPackNames,
      identityLoading,
      identityError,
    ]
  );

  return <UserPurchasesContext.Provider value={value}>{children}</UserPurchasesContext.Provider>;
}

export function useUserPurchasesContext() {
  const context = useContext(UserPurchasesContext);

  if (!context) {
    throw new Error("useUserPurchasesContext must be used inside UserPurchasesProvider.");
  }

  return context;
}
