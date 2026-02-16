import { createContext, useContext, useMemo } from "react";

import { getClientUserId } from "@/components/store/storeApi";
import useUserPurchases from "@/hooks/useUserPurchases";

const UserPurchasesContext = createContext(null);

export function UserPurchasesProvider({ children }) {
  const userId = useMemo(() => getClientUserId(), []);
  const { purchases, loading, error, refresh, isPackUnlocked, unlockedPackIds } = useUserPurchases(userId);

  const unlockedPackNames = useMemo(() => {
    const names = purchases
      .filter((row) => row?.status === "completed")
      .map((row) => row?.course_pack?.name)
      .filter(Boolean);

    return Array.from(new Set(names));
  }, [purchases]);

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
    }),
    [userId, purchases, loading, error, refresh, isPackUnlocked, unlockedPackIds, unlockedPackNames]
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

