import { useEffect, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useUserSubscriptionContext } from "@/context/UserSubscriptionContext";

const POLL_INTERVAL_MS = 1500;
const MAX_ATTEMPTS = 8;

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

export default function SubscriptionSuccess({ onAcknowledge }) {
  const navigate = useNavigate();
  const { subscription, isActive, refresh } = useUserSubscriptionContext();
  const [attempts, setAttempts] = useState(0);

  useEffect(() => {
    if (isActive) {
      return;
    }
    if (attempts >= MAX_ATTEMPTS) {
      return;
    }
    const timer = setTimeout(() => {
      refresh();
      setAttempts((n) => n + 1);
    }, POLL_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [attempts, isActive, refresh]);

  if (!isActive) {
    return (
      <Card className="border-border/50 bg-card/60">
        <CardHeader className="text-center space-y-3">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent/15">
            <Loader2 className="h-6 w-6 animate-spin text-accent" />
          </div>
          <h3 className="text-xl font-semibold text-foreground">Finishing up your subscription</h3>
          <p className="text-sm text-muted-foreground">
            {attempts < MAX_ATTEMPTS
              ? "This usually takes a few seconds while Stripe confirms the payment."
              : "Still processing. Refresh the page in a moment, or check back in your dashboard."}
          </p>
        </CardHeader>
        {attempts >= MAX_ATTEMPTS && (
          <CardContent className="flex justify-center gap-2">
            <Button variant="outline" onClick={onAcknowledge}>
              Continue
            </Button>
            <Button onClick={() => refresh()}>Retry</Button>
          </CardContent>
        )}
      </Card>
    );
  }

  const trialEnd = formatDate(subscription?.trial_end);

  return (
    <Card className="border-accent/40 bg-card/70">
      <CardHeader className="text-center space-y-3">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-500/15 text-green-400">
          <CheckCircle2 className="h-7 w-7" />
        </div>
        <h3 className="text-xl font-semibold text-foreground">You're in!</h3>
        {trialEnd ? (
          <p className="text-sm text-muted-foreground">
            Your free trial is active until <span className="text-foreground">{trialEnd}</span>. We'll start billing then.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">Your subscription is active.</p>
        )}
      </CardHeader>
      <CardContent className="flex justify-center gap-2">
        <Button variant="outline" onClick={onAcknowledge}>
          View plan
        </Button>
        <Button onClick={() => navigate("/app/mentor")}>Go to Mentor</Button>
      </CardContent>
    </Card>
  );
}
