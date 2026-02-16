import { BookOpen, Brain, Briefcase, Cpu, HeartPulse, Sparkles } from "lucide-react";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatUsd } from "@/components/store/storeApi";

const CATEGORY_ICONS = {
  healthcare: HeartPulse,
  social_sciences: Brain,
  stem: Cpu,
  business: Briefcase,
  education: BookOpen,
};

export default function DegreeSelector({ degreePlans, loading, onSelect }) {
  if (loading) {
    return (
      <Card className="bg-card/50 border-border/40">
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Loading degree plans...
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="text-center">
        <h2 className="text-xl font-semibold text-foreground">Choose Your Degree Plan</h2>
        <p className="text-sm text-muted-foreground">
          Start by selecting the area you are studying.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {degreePlans.map((plan) => {
          const Icon = CATEGORY_ICONS[plan.category] || Sparkles;

          return (
            <Card key={plan.id} className="bg-card/60 border-border/50 hover:border-accent/40 transition-colors">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="p-2 rounded-lg bg-accent/10 text-accent">
                    <Icon className="w-5 h-5" />
                  </div>
                  <Badge variant="secondary" className="text-xs">
                    {plan.pack_count || 0} packs
                  </Badge>
                </div>
                <div>
                  <h3 className="text-base font-semibold text-foreground">{plan.name}</h3>
                  <p className="text-xs text-muted-foreground capitalize">{plan.category.replace("_", " ")}</p>
                </div>
              </CardHeader>

              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground min-h-[2.5rem]">{plan.description}</p>
                <p className="text-xs text-muted-foreground">
                  {plan.min_price != null && plan.max_price != null
                    ? `${formatUsd(plan.min_price)} - ${formatUsd(plan.max_price)}`
                    : "Pricing available at next step"}
                </p>
                <Button className="w-full" onClick={() => onSelect(plan)}>
                  Select {plan.name}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
