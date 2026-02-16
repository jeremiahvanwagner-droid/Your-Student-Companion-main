import { useMemo } from "react";

import TheMentor from "@/components/TheMentor";
import { useUserPurchasesContext } from "@/context/UserPurchasesContext";

export default function MentorPage() {
  const { unlockedPackIds, unlockedPackNames } = useUserPurchasesContext();

  const unlockedPacks = useMemo(() => Array.from(unlockedPackIds), [unlockedPackIds]);

  return <TheMentor unlockedPacks={unlockedPacks} unlockedPackNames={unlockedPackNames} />;
}

