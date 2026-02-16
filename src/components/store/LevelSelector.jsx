import { ArrowLeft, CheckCircle2, Lock } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { formatUsd } from "@/components/store/storeApi";

export default function LevelSelector({ degreePlan, packs, loading, onBack, onSelect, isPackUnlocked }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-semibold text-foreground">{degreePlan?.name}</h2>
          <p className="text-sm text-muted-foreground">Choose your academic level tier.</p>
        </div>
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-2">
          <ArrowLeft className="w-4 h-4" />
          Back
        </Button>
      </div>

      {loading ? (
        <Card className="bg-card/50 border-border/40">
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Loading packs...
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {packs.map((pack) => {
            const unlocked = isPackUnlocked(pack.id);
            const levelName = pack?.academic_level?.name || "Level";

            return (
              <Card key={pack.id} className="bg-card/60 border-border/50 hover:border-accent/40 transition-colors">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2">
                    <Badge className="bg-accent/15 text-accent border-accent/20">{levelName}</Badge>
                    {unlocked ? (
                      <Badge className="bg-green-500/15 text-green-400 border-green-500/20 gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        Unlocked
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="gap-1">
                        <Lock className="w-3 h-3" />
                        Locked
                      </Badge>
                    )}
                  </div>
                  <h3 className="text-sm font-semibold text-foreground">{pack.name}</h3>
                </CardHeader>

                <CardContent className="space-y-3">
                  <p className="text-xs text-muted-foreground min-h-[2.25rem]">{pack.description}</p>
                  <p className="text-base font-semibold text-accent">{formatUsd(pack.price)}</p>
                  <Button className="w-full" variant={unlocked ? "outline" : "default"} onClick={() => onSelect(pack)}>
                    {unlocked ? "View" : "See Details"}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
