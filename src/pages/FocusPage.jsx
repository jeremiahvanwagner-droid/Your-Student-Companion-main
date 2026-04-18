import { useState } from "react";

import FocusMode from "@/components/FocusMode";
import FocusStats from "@/components/FocusStats";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function FocusPage() {
  const [isFocusActive, setIsFocusActive] = useState(false);

  return (
    <div className={`space-y-4 ${isFocusActive ? "overflow-hidden" : ""}`}>
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Focus Mode</h1>
        <p className="text-sm text-muted-foreground">Track your Pomodoro sessions — time and focus data sync automatically to your profile.</p>
      </div>

      <Card className="border-border/40 bg-card/50">
        <CardHeader>
          <CardTitle className="text-base">Start a Session</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-start gap-4">
          <FocusMode onFocusStateChange={setIsFocusActive} />
          <FocusStats />
        </CardContent>
      </Card>
    </div>
  );
}
