import { useState } from "react";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { createBillingPortalSession } from "@/components/store/subscriptionApi";
import { useUserSubscriptionContext } from "@/context/UserSubscriptionContext";

const TIER_LABEL = {
  degree_bundle: "Degree Bundle",
  all_access: "All-Access",
};

function formatDate(isoString) {
  if (!isoString) return null;
  try {
    return new Date(isoString).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return null;
  }
}

export default function CurrentSubscriptionBanner() {
  const { subscription, isTrialing } = useUserSubscriptionContext();
  const [opening, setOpening] = useState(false);

  if (!subscription) {
    return null;
  }

  const tierLabel = TIER_LABEL[subscription.tier] || subscription.tier || "Subscription";
  const cadence = subscription.plan_type?.endsWith("_annual") ? "annual" : "monthly";
  const trialEnd = formatDate(subscription.trial_end);
  const periodEnd = formatDate(subscription.current_period_end);

  const handleManage = async () => {
    setOpening(true);
    try {
      const result = await createBillingPortalSession({
        return_url: `${window.location.origin}/app/subscribe`,
      });
      if (!result?.portal_url) {
        throw new Error("Portal URL missing from API response.");
      }
      window.location.href = result.portal_url;
    } catch (err) {
      toast.error("Could not open billing portal", { description: err.message });
    } finally {
      setOpening(false);
    }
  };

  return (
    <Card className="border-accent/40 bg-card/70">
      <CardHeader className="space-y-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-accent" />
          <h2 className="text-lg font-semibold text-foreground">
            You're on the {tierLabel} ({cadence})
          </h2>
        </div>
        {isTrialing && trialEnd && (
          <p className="text-sm text-muted-foreground">
            Your free trial ends <span className="text-foreground">{trialEnd}</span>. We'll start your billing then.
          </p>
        )}
        {!isTrialing && periodEnd && (
          <p className="text-sm text-muted-foreground">
            Next renewal: <span className="text-foreground">{periodEnd}</span>
            {subscription.cancel_at_period_end && (
              <span className="ml-2 text-destructive">(set to cancel)</span>
            )}
          </p>
        )}
      </CardHeader>
      <CardContent>
        <Button variant="outline" onClick={handleManage} disabled={opening}>
          {opening ? "Opening..." : "Manage subscription"}
        </Button>
      </CardContent>
    </Card>
  );
}
