import { useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { toast } from "sonner";

import { track } from "@/lib/analytics";
import SubscriptionPlans from "@/components/subscribe/SubscriptionPlans";
import SubscriptionSuccess from "@/components/subscribe/SubscriptionSuccess";
import { useUserSubscriptionContext } from "@/context/UserSubscriptionContext";

export default function SubscribePage() {
  const location = useLocation();
  const { refresh } = useUserSubscriptionContext();
  const [view, setView] = useState("plans");

  const clearCheckoutQuery = useCallback(() => {
    const params = new URLSearchParams(window.location.search);
    params.delete("checkout");
    const nextQuery = params.toString();
    const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}`;
    window.history.replaceState({}, "", nextUrl);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const status = params.get("checkout");

    if (status === "success") {
      setView("success");
      track("checkout_success", { kind: "subscription" });
      toast.success("Subscription started", {
        description: "Refreshing your plan details.",
      });
      refresh();
    }

    if (status === "cancel") {
      toast.info("Checkout canceled", { description: "You can pick a plan whenever you're ready." });
      clearCheckoutQuery();
    }
  }, [clearCheckoutQuery, location.search, refresh]);

  const handleAcknowledge = useCallback(() => {
    setView("plans");
    clearCheckoutQuery();
  }, [clearCheckoutQuery]);

  return (
    <div className="mx-auto max-w-3xl space-y-6 py-4">
      {view === "success" ? (
        <SubscriptionSuccess onAcknowledge={handleAcknowledge} />
      ) : (
        <SubscriptionPlans />
      )}
    </div>
  );
}
