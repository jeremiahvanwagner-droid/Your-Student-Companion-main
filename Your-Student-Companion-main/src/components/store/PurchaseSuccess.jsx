import { CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function PurchaseSuccess({ onContinue }) {
  return (
    <Card className="bg-card/70 border-border/50">
      <CardHeader className="text-center space-y-3">
        <div className="mx-auto p-3 rounded-full bg-green-500/15 text-green-400 w-fit">
          <CheckCircle2 className="w-7 h-7" />
        </div>
        <h3 className="text-xl font-semibold text-foreground">Purchase Completed</h3>
        <p className="text-sm text-muted-foreground">
          Your checkout succeeded. We are refreshing your unlocked content now.
        </p>
      </CardHeader>

      <CardContent className="flex justify-center">
        <Button onClick={onContinue}>Continue Browsing</Button>
      </CardContent>
    </Card>
  );
}
