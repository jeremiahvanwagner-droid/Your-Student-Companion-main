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

const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["active", "trialing"]);

function subscriptionUnlocks(subscription, pack) {
  if (!subscription) return false;
  if (!ACTIVE_SUBSCRIPTION_STATUSES.has(subscription.status)) return false;

  if (subscription.tier === "all_access") {
    return true;
  }

  if (subscription.tier === "degree_bundle" && pack && pack.degree_plan_id != null) {
    return String(subscription.degree_plan_id) === String(pack.degree_plan_id);
  }

  return false;
}

export default function useUserPurchases(userId, subscription = null) {
  const [purchases, setPurchases] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    if (!userId || String(userId).startsWith("guest_")) {
      setPurchases([]);
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
    (packOrId) => {
      const pack = packOrId && typeof packOrId === "object" ? packOrId : null;
      const packId = pack ? String(pack.id) : String(packOrId);

      if (unlockedPackIds.has(packId)) {
        return true;
      }

      return subscriptionUnlocks(subscription, pack);
    },
    [subscription, unlockedPackIds]
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
