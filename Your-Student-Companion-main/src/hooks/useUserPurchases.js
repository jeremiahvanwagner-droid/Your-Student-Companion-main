import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchUserPurchases } from "@/components/store/storeApi";

const STORAGE_KEY = "studentCompanion_unlockedPacks";

export function getUnlockedPacks() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistUnlockedPacks(packIds) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(packIds));
}

export default function useUserPurchases(userId) {
  const [purchases, setPurchases] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    if (!userId) {
      setPurchases([]);
      persistUnlockedPacks([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await fetchUserPurchases(userId);
      const purchaseRows = result?.purchases || [];
      setPurchases(purchaseRows);

      const unlocked = purchaseRows
        .filter((row) => row?.status === "completed")
        .map((row) => String(row.course_pack_id));

      persistUnlockedPacks(unlocked);
    } catch (err) {
      setError(err.message || "Failed to load purchases.");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const unlockedPackIds = useMemo(
    () => new Set(purchases.filter((row) => row?.status === "completed").map((row) => String(row.course_pack_id))),
    [purchases]
  );

  const isPackUnlocked = useCallback(
    (packId) => unlockedPackIds.has(String(packId)),
    [unlockedPackIds]
  );

  return {
    purchases,
    loading,
    error,
    refresh,
    isPackUnlocked,
    unlockedPackIds,
  };
}
