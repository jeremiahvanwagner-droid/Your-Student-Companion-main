import { useMemo } from "react";

import TheMentor from "@/components/TheMentor";
import { getClientUserId } from "@/components/store/storeApi";
import useUserPurchases from "@/hooks/useUserPurchases";

export default function MentorPage() {
  const userId = useMemo(() => getClientUserId(), []);
  const { purchases } = useUserPurchases(userId);

  const unlockedPackIds = useMemo(
    () =>
      purchases
        .filter((row) => row?.status === "completed")
        .map((row) => String(row.course_pack_id)),
    [purchases]
  );

  const unlockedPackNames = useMemo(() => {
    const names = purchases
      .filter((row) => row?.status === "completed")
      .map((row) => row?.course_pack?.name)
      .filter(Boolean);

    return Array.from(new Set(names));
  }, [purchases]);

  return <TheMentor unlockedPacks={unlockedPackIds} unlockedPackNames={unlockedPackNames} />;
}
