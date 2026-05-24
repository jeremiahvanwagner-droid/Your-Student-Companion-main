import { Check, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatUsd } from "@/components/store/storeApi";

const TIER_COPY = {
  degree_bundle: {
    title: "Degree Bundle",
    blurb: "Unlock every pack within one degree, plus voice mentor up to 60 min/month.",
    features: [
      "All packs for one degree",
      "Voice mentor (60 min/month)",
      "AI Mentor chat (unlimited)",
      "14-day free trial",
    ],
  },
  all_access: {
    title: "All-Access",
    blurb: "Every degree, every pack, unlimited voice mentor, plus future placement tests.",
    features: [
      "All 14 degrees, every pack",
      "Voice mentor (unlimited)",
      "AI Mentor chat (unlimited)",
      "Placement tests + internship board",
      "14-day free trial",
    ],
  },
};

export default function TierCard({
  tier,
  monthlyAmount,
  annualAmount,
  cadence,
  degreePlans,
  selectedDegreePlanId,
  onSelectDegree,
  onCheckout,
  checkoutLoading,
  highlighted,
}) {
  const copy = TIER_COPY[tier];
  const amount = cadence === "annual" ? annualAmount : monthlyAmount;
  const suffix = cadence === "annual" ? "/year" : "/month";

  const requiresDegree = tier === "degree_bundle";
  const ctaDisabled = checkoutLoading || (requiresDegree && !selectedDegreePlanId);

  return (
    <Card
      className={
        highlighted
          ? "border-accent/60 bg-card/80 shadow-[0_0_0_1px_hsl(166,100%,70%,0.25)]"
          : "border-border/50 bg-card/60"
      }
    >
      <CardHeader className="space-y-3 pb-3">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-foreground">{copy.title}</h3>
          {highlighted && (
            <Badge className="bg-accent/15 text-accent">
              <Sparkles className="mr-1 h-3 w-3" />
              Best value
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">{copy.blurb}</p>
        <div className="flex items-baseline gap-1">
          <span className="text-3xl font-semibold text-foreground">{formatUsd(amount)}</span>
          <span className="text-sm text-muted-foreground">{suffix}</span>
        </div>
        {cadence === "annual" && (
          <p className="text-xs text-accent">Save ~16% — about 2 months free</p>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        <ul className="space-y-2">
          {copy.features.map((feature) => (
            <li key={feature} className="flex items-start gap-2 text-sm text-foreground/90">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
              <span>{feature}</span>
            </li>
          ))}
        </ul>

        {requiresDegree && (
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">Choose your degree</label>
            <Select
              value={selectedDegreePlanId ? String(selectedDegreePlanId) : undefined}
              onValueChange={(value) => onSelectDegree(Number(value))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a degree" />
              </SelectTrigger>
              <SelectContent>
                {degreePlans.map((plan) => (
                  <SelectItem key={plan.id} value={String(plan.id)}>
                    {plan.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <Button
          className="w-full"
          onClick={() => onCheckout(tier)}
          disabled={ctaDisabled}
        >
          {checkoutLoading ? "Starting..." : "Start 14-day free trial"}
        </Button>
      </CardContent>
    </Card>
  );
}
