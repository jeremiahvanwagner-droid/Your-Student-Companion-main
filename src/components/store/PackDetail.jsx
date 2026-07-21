import { ArrowLeft, CheckCircle2, Loader2, LockOpen } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { formatUsd } from "@/components/store/storeApi";
import { isAndroidTwa } from "@/lib/platform";

export default function PackDetail({
  pack,
  isUnlocked,
  onBack,
  onCheckout,
  checkoutLoading,
}) {
  const features = Array.isArray(pack?.features) ? pack.features : [];

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={onBack} className="gap-2">
        <ArrowLeft className="w-4 h-4" />
        Back to levels
      </Button>

      <Card className="bg-card/70 border-border/50">
        <CardHeader className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Badge className="bg-accent/15 text-accent border-accent/20">
              {pack?.degree_plan?.name}
            </Badge>
            {isUnlocked ? (
              <Badge className="bg-green-500/15 text-green-400 border-green-500/20 gap-1">
                <CheckCircle2 className="w-3 h-3" />
                Purchased
              </Badge>
            ) : (
              <Badge variant="secondary">{pack?.academic_level?.name}</Badge>
            )}
          </div>

          <h3 className="text-xl font-semibold text-foreground">{pack?.name}</h3>
          <p className="text-sm text-muted-foreground">{pack?.description}</p>
        </CardHeader>

        <CardContent className="space-y-5">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">
              What's Included
            </p>
            <ul className="space-y-2">
              {features.map((feature, index) => (
                <li key={index} className="text-sm text-foreground flex items-start gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-accent" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-lg border border-border/40 bg-background/40 p-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs text-muted-foreground">One-time purchase</p>
              <p className="text-2xl font-semibold text-accent">{formatUsd(pack?.price)}</p>
            </div>

            {isUnlocked ? (
              <Button variant="outline" className="gap-2" disabled>
                <CheckCircle2 className="w-4 h-4" />
                Unlocked
              </Button>
            ) : isAndroidTwa() ? (
              // Google Play payments policy: the Android app is
              // consumption-only — no purchase flows, no external links.
              <p className="max-w-[180px] text-right text-xs text-muted-foreground">
                Purchases aren't available in this app.
              </p>
            ) : (
              <Button onClick={() => onCheckout(pack)} disabled={checkoutLoading} className="gap-2">
                {checkoutLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Redirecting
                  </>
                ) : (
                  <>
                    <LockOpen className="w-4 h-4" />
                    Continue to Checkout
                  </>
                )}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
