import { useCallback, useEffect, useState } from "react";
import { ShoppingBag } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
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
} from "@/components/store/storeApi";
import { useUserPurchasesContext } from "@/context/UserPurchasesContext";

export default function StoreBrowser({ onPackUnlock, initialDegreeSlug }) {
  const location = useLocation();
  const navigate = useNavigate();

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
    userId,
    loading: purchasesLoading,
    error: purchasesError,
    refresh: refreshPurchases,
    isPackUnlocked,
    unlockedPackIds,
  } = useUserPurchasesContext();

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
    if (!initialDegreeSlug || degreePlansLoading || selectedDegree || degreePlans.length === 0) {
      return;
    }

    const match = degreePlans.find((plan) => plan.slug === initialDegreeSlug);
    if (!match) {
      return;
    }

    loadDegreePacks(match);
  }, [degreePlans, degreePlansLoading, initialDegreeSlug, loadDegreePacks, selectedDegree]);

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
    navigate("/app/store", { replace: true });
  }, [navigate]);

  const resetToLevelSelection = useCallback(() => {
    setSelectedPack(null);
  }, []);

  return (
    <div className="space-y-5">
      <div className="text-center">
        <div className="mb-1 flex items-center justify-center gap-2">
          <ShoppingBag className="h-5 w-5 text-accent" />
          <h2 className="text-xl font-semibold text-foreground">Course Pack Store</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Select your degree and level, then checkout securely through Stripe.
        </p>
      </div>

      {degreePlansError && (
        <Card className="border-destructive/30 bg-destructive/10">
          <CardContent className="py-4 text-sm text-destructive">{degreePlansError}</CardContent>
        </Card>
      )}

      {purchasesError && (
        <Card className="border-destructive/30 bg-destructive/10">
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
            navigate(`/app/store/${plan.slug}`);
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
          isUnlocked={isPackUnlocked(selectedPack)}
          onBack={resetToLevelSelection}
          onCheckout={handleCheckout}
          checkoutLoading={checkoutLoading || purchasesLoading}
        />
      )}

      {selectedDegree && !selectedPack && !degreePacksLoading && degreePacks.length === 0 && (
        <Card className="border-border/40 bg-card/50">
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No packs found for this degree plan.
          </CardContent>
        </Card>
      )}
    </div>
  );
}

