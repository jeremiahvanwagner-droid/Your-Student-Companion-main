import StoreBrowser from "@/components/store/StoreBrowser";
import { getUnlockedPacks } from "@/hooks/useUserPurchases";

const STORAGE_KEY = "studentCompanion_unlockedPacks";

const Store = ({ onPackUnlock }) => {
  return <StoreBrowser onPackUnlock={onPackUnlock} />;
};

export { Store, getUnlockedPacks, STORAGE_KEY };
export default Store;
