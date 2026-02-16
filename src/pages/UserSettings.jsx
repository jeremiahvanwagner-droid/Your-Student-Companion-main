import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { RotateCcw, Settings } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { persistMyStudentProfile, setOnboardingComplete } from "@/lib/onboarding";

export default function UserSettings() {
  const navigate = useNavigate();
  const [resetting, setResetting] = useState(false);

  const restartOnboarding = async () => {
    setResetting(true);

    try {
      await persistMyStudentProfile({ onboarding_completed: false });
      setOnboardingComplete(false);

      toast.info("Onboarding reset", {
        description: "You can complete onboarding again to refresh your student profile.",
      });
      navigate("/app/onboarding");
    } catch (error) {
      toast.error("Could not reset onboarding", {
        description: error?.message || "Please try again.",
      });
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground">Account and personalization controls are staged for Module A + Module J.</p>
      </div>

      <Card className="border-border/40 bg-card/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Settings className="h-4 w-4 text-accent" />
            Profile + Preferences
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>Theme, timezone, notifications, and study preferences will be connected to `student_profiles`.</p>
          <Button variant="outline" className="border-border/50" onClick={restartOnboarding} disabled={resetting}>
            <RotateCcw className="mr-2 h-4 w-4" />
            {resetting ? "Resetting..." : "Restart Onboarding"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
