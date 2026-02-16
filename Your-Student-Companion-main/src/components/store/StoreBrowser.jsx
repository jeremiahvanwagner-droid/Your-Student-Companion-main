import { useCallback, useEffect, useMemo, useState } from "react";
import { ShoppingBag } from "lucide-react";
import { useLocation } from "react-router-dom";
import { toast } from "sonner";

import { Card, CardContent } from "@/components/ui/card";
import DegreeSelector from "@/components/store/DegreeSelector";
import LevelSelector from "@/components/store/LevelSelector";
import PackDetail from "@/components/store/PackDetail";
import PurchaseSuccess from "@/components/store/PurchaseSuccess";
import {
  createCheckoutSession,
  fetchDegreePacks,
  fetchDegreePlans,
  fetchPack,
  getClientUserId,
} from "@/components/store/storeApi";
import useUserPurchases from "@/hooks/useUserPurchases";

export default function StoreBrowser({ onPackUnlock }) {
  const location = useLocation();
  const userId = useMemo(() => getClientUserId(), []);

  const [degreePlans, setDegreePlans] = useState([]);
  const [degreePlansLoading, setDegreePlansLoading] = useState(true);
  const [degreePlansError, setDegreePlansError] = useState(null);

  const [selectedDegree, setSelectedDegree] = useState(null);
  const [degreePacks, setDegreePacks] = useState([]);
  const [degreePacksLoading, setDegreePacksLoading] = useState(false);

  const [selectedPack, setSelectedPack] = useState(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutStatus, setCheckoutStatus] = useState(null);

  const {
    loading: purchasesLoading,
    error: purchasesError,
    refresh: refreshPurchases,
    isPackUnlocked,
    unlockedPackIds,
  } = useUserPurchases(userId);

  const clearCheckoutQuery = useCallback(() => {
    const params = new URLSearchParams(window.location.search);
    params.delete("checkout");
    params.delete("pack");
    const nextQuery = params.toString();
    const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}`;
    window.history.replaceState({}, "", nextUrl);
  }, []);

  const loadDegreePlans = useCallback(async () => {
    setDegreePlansLoading(true);
    setDegreePlansError(null);
    try {
      const result = await fetchDegreePlans();
      setDegreePlans(result.degree_plans || []);
    } catch (err) {
      setDegreePlansError(err.message || "Unable to load degree plans.");
    } finally {
      setDegreePlansLoading(false);
    }
  }, []);

  const loadDegreePacks = useCallback(async (degreePlan) => {
    setDegreePacksLoading(true);
    try {
      const result = await fetchDegreePacks(degreePlan.slug);
      setDegreePacks(result.packs || []);
      setSelectedDegree(result.degree_plan || degreePlan);
    } catch (err) {
      toast.error("Failed to load packs", { description: err.message });
    } finally {
      setDegreePacksLoading(false);
    }
  }, []);

  const loadPackDetail = useCallback(async (pack) => {
    try {
      const result = await fetchPack(pack.id);
      setSelectedPack(result);
    } catch (err) {
      toast.error("Failed to load pack", { description: err.message });
    }
  }, []);

  useEffect(() => {
    loadDegreePlans();
  }, [loadDegreePlans]);

  useEffect(() => {
    if (onPackUnlock && unlockedPackIds.size > 0) {
      onPackUnlock();
    }
  }, [onPackUnlock, unlockedPackIds]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const status = params.get("checkout");
    const packId = params.get("pack");

    if (!status) {
      return;
    }

    if (status === "success") {
      setCheckoutStatus("success");
      toast.success("Payment successful", {
        description: "Refreshing your purchased packs.",
      });
      refreshPurchases();

      if (packId) {
        const match = degreePacks.find((pack) => String(pack.id) === String(packId));
        if (match) {
          setSelectedPack(match);
        }
      }
    }

    if (status === "cancel") {
      setCheckoutStatus("cancel");
      toast.info("Checkout canceled", {
        description: "You can continue browsing packs.",
      });
    }

    clearCheckoutQuery();
  }, [clearCheckoutQuery, degreePacks, location.search, refreshPurchases]);

  const handleCheckout = useCallback(
    async (pack) => {
      setCheckoutLoading(true);
      try {
        const baseUrl = `${window.location.origin}${window.location.pathname}`;
        const session = await createCheckoutSession({
          user_id: userId,
          course_pack_id: String(pack.id),
          success_url: `${baseUrl}?checkout=success&pack=${pack.id}`,
          cancel_url: `${baseUrl}?checkout=cancel&pack=${pack.id}`,
          quantity: 1,
        });

        if (!session?.checkout_url) {
          throw new Error("Checkout URL missing from API response.");
        }

        window.location.href = session.checkout_url;
      } catch (err) {
        toast.error("Checkout failed", { description: err.message });
      } finally {
        setCheckoutLoading(false);
      }
    },
    [userId]
  );

  const resetToDegreeSelection = useCallback(() => {
    setSelectedDegree(null);
    setSelectedPack(null);
    setDegreePacks([]);
    setCheckoutStatus(null);
  }, []);

  const resetToLevelSelection = useCallback(() => {
    setSelectedPack(null);
  }, []);

  return (
    <div className="space-y-5">
      <div className="text-center">
        <div className="flex items-center justify-center gap-2 mb-1">
          <ShoppingBag className="w-5 h-5 text-accent" />
          <h2 className="text-xl font-semibold text-foreground">Course Pack Store</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Select your degree and level, then checkout securely through Stripe.
        </p>
      </div>

      {degreePlansError && (
        <Card className="bg-destructive/10 border-destructive/30">
          <CardContent className="py-4 text-sm text-destructive">{degreePlansError}</CardContent>
        </Card>
      )}

      {purchasesError && (
        <Card className="bg-destructive/10 border-destructive/30">
          <CardContent className="py-4 text-sm text-destructive">{purchasesError}</CardContent>
        </Card>
      )}

      {checkoutStatus === "success" && (
        <PurchaseSuccess
          onContinue={() => {
            setCheckoutStatus(null);
            refreshPurchases();
          }}
        />
      )}

      {!selectedDegree ? (
        <DegreeSelector
          degreePlans={degreePlans}
          loading={degreePlansLoading}
          onSelect={(plan) => {
            setCheckoutStatus(null);
            loadDegreePacks(plan);
          }}
        />
      ) : !selectedPack ? (
        <LevelSelector
          degreePlan={selectedDegree}
          packs={degreePacks}
          loading={degreePacksLoading}
          onBack={resetToDegreeSelection}
          onSelect={loadPackDetail}
          isPackUnlocked={isPackUnlocked}
        />
      ) : (
        <PackDetail
          pack={selectedPack}
          isUnlocked={isPackUnlocked(selectedPack.id)}
          onBack={resetToLevelSelection}
          onCheckout={handleCheckout}
          checkoutLoading={checkoutLoading || purchasesLoading}
        />
      )}

      {selectedDegree && !selectedPack && !degreePacksLoading && degreePacks.length === 0 && (
        <Card className="bg-card/50 border-border/40">
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No packs found for this degree plan.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
