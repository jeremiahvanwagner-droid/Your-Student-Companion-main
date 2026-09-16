import { useMemo } from "react";
import { useUser } from "@clerk/clerk-react";

import TheMentor from "@/components/TheMentor";
import { useUserPurchasesContext } from "@/context/UserPurchasesContext";
import { readAgeGate } from "@/lib/ageGate";

export default function MentorPage() {
  const { userId, unlockedPackIds, unlockedPackNames } = useUserPurchasesContext();
  const { user } = useUser();

  const unlockedPacks = useMemo(() => Array.from(unlockedPackIds), [unlockedPackIds]);

  // Derived from the AgeGate bracket; forwarded so the backend can apply the
  // minor age-safety system prompt. The backend treats a JWT claim as
  // authoritative over this hint when one is present.
  const isMinor = readAgeGate(user?.unsafeMetadata).isMinor;

  return (
    <TheMentor
      userId={userId}
      unlockedPacks={unlockedPacks}
      unlockedPackNames={unlockedPackNames}
      isMinor={isMinor}
    />
  );
}
