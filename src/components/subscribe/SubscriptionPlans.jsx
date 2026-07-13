import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { track } from "@/lib/analytics";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import CurrentSubscriptionBanner from "@/components/subscribe/CurrentSubscriptionBanner";
import TierCard from "@/components/subscribe/TierCard";
import { fetchDegreePlans } from "@/components/store/storeApi";
import { createSubscriptionCheckoutSession } from "@/components/store/subscriptionApi";
import { useUserPurchasesContext } from "@/context/UserPurchasesContext";
import { useUserSubscriptionContext } from "@/context/UserSubscriptionContext";

const PRICING = {
  degree_bundle: { monthly: 7.99, annual: 79.99 },
  all_access: { monthly: 14.99, annual: 149.99 },
};

export default function SubscriptionPlans() {
  const [cadence, setCadence] = useState("monthly");
  const [selectedDegreePlanId, setSelectedDegreePlanId] = useState(null);
  const [degreePlans, setDegreePlans] = useState([]);
  const [degreePlansLoading, setDegreePlansLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState(null);

  const { isActive } = useUserSubscriptionContext();
  const { purchases } = useUserPurchasesContext();

  const hasLifetimeAccess = purchases.some((row) => row?.lifetime_access);

  useEffect(() => {
    let isMounted = true;
    fetchDegreePlans()
      .then((result) => {
        if (!isMounted) return;
        setDegreePlans(result?.degree_plans || []);
      })
      .catch((err) => {
        if (!isMounted) return;
        toast.error("Failed to load degree list", { description: err.message });
      })
      .finally(() => {
        if (isMounted) setDegreePlansLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  const handleCheckout = useCallback(
    async (tier) => {
      if (tier === "degree_bundle" && !selectedDegreePlanId) {
        toast.error("Pick a degree", {
          description: "The Degree Bundle covers one degree. Pick which one.",
        });
        return;
      }

      setCheckoutLoading(tier);
      track("checkout_start", { kind: "subscription", tier, cadence });
      try {
        const baseUrl = `${window.location.origin}/app/subscribe`;
        const session = await createSubscriptionCheckoutSession({
          tier,
          cadence,
          degree_plan_id: tier === "degree_bundle" ? selectedDegreePlanId : null,
          success_url: `${baseUrl}?checkout=success`,
          cancel_url: `${baseUrl}?checkout=cancel`,
        });

        if (!session?.checkout_url) {
          throw new Error("Checkout URL missing from API response.");
        }

        window.location.href = session.checkout_url;
      } catch (err) {
        toast.error("Could not start checkout", { description: err.message });
      } finally {
        setCheckoutLoading(null);
      }
    },
    [cadence, selectedDegreePlanId]
  );

  if (isActive) {
    return <CurrentSubscriptionBanner />;
  }

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-semibold text-foreground">Pick your plan</h1>
        <p className="text-sm text-muted-foreground">
          Both tiers start with a 14-day free trial. Cancel anytime.
        </p>
      </div>

      {hasLifetimeAccess && (
        <Card className="border-accent/30 bg-accent/5">
          <CardContent className="py-4 text-sm text-foreground/90">
            Your existing packs are yours forever. Subscribing adds new degrees and the voice mentor.
          </CardContent>
        </Card>
      )}

      <div className="flex justify-center">
        <div className="inline-flex rounded-md border border-border/60 bg-card/50 p-1">
          <Button
            variant={cadence === "monthly" ? "default" : "ghost"}
            size="sm"
            onClick={() => setCadence("monthly")}
          >
            Monthly
          </Button>
          <Button
            variant={cadence === "annual" ? "default" : "ghost"}
            size="sm"
            onClick={() => setCadence("annual")}
          >
            Annual <span className="ml-1 text-xs opacity-70">save ~16%</span>
          </Button>
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <TierCard
          tier="degree_bundle"
          monthlyAmount={PRICING.degree_bundle.monthly}
          annualAmount={PRICING.degree_bundle.annual}
          cadence={cadence}
          degreePlans={degreePlans}
          selectedDegreePlanId={selectedDegreePlanId}
          onSelectDegree={setSelectedDegreePlanId}
          onCheckout={handleCheckout}
          checkoutLoading={checkoutLoading === "degree_bundle" || degreePlansLoading}
        />
        <TierCard
          tier="all_access"
          monthlyAmount={PRICING.all_access.monthly}
          annualAmount={PRICING.all_access.annual}
          cadence={cadence}
          degreePlans={degreePlans}
          onCheckout={handleCheckout}
          checkoutLoading={checkoutLoading === "all_access"}
          highlighted
        />
      </div>
    </div>
  );
}
