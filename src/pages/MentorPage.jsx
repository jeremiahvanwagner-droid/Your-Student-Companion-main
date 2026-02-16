import { useMemo } from "react";

import TheMentor from "@/components/TheMentor";
import { useUserPurchasesContext } from "@/context/UserPurchasesContext";

export default function MentorPage() {
  const { userId, unlockedPackIds, unlockedPackNames } = useUserPurchasesContext();

  const unlockedPacks = useMemo(() => Array.from(unlockedPackIds), [unlockedPackIds]);

  return (
    <TheMentor
      userId={userId}
      unlockedPacks={unlockedPacks}
      unlockedPackNames={unlockedPackNames}
    />
  );
}
