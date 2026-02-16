import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setOnboardingComplete, setOnboardingProfile, getOnboardingProfile } from "@/lib/onboarding";

const STEP_TITLES = [
  "Grade Level",
  "Subjects",
  "Weekly Goal",
  "Study Preferences",
  "Timezone",
];

const DEFAULT_PROFILE = {
  grade_level: "",
  subjects: "",
  weekly_goal_hours: 10,
  study_preferences: "",
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York",
};

export default function OnboardingFlow() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState(() => ({ ...DEFAULT_PROFILE, ...(getOnboardingProfile() || {}) }));

  const canProceed = useMemo(() => {
    if (step === 0) {
      return Boolean(profile.grade_level?.trim());
    }
    if (step === 1) {
      return Boolean(profile.subjects?.trim());
    }
    if (step === 2) {
      return Number(profile.weekly_goal_hours) > 0;
    }
    if (step === 4) {
      return Boolean(profile.timezone?.trim());
    }
    return true;
  }, [profile, step]);

  const nextStep = () => {
    if (!canProceed) {
      toast.error("Complete this step before continuing.");
      return;
    }
    setStep((current) => Math.min(current + 1, STEP_TITLES.length - 1));
  };

  const previousStep = () => {
    setStep((current) => Math.max(current - 1, 0));
  };

  const finishOnboarding = () => {
    if (!canProceed) {
      toast.error("Please complete all required fields.");
      return;
    }

    setOnboardingProfile({
      ...profile,
      weekly_goal_hours: Number(profile.weekly_goal_hours) || 10,
      updated_at: new Date().toISOString(),
    });
    setOnboardingComplete(true);

    toast.success("Onboarding completed", {
      description: "Your dashboard is ready.",
    });

    navigate("/app/dashboard", { replace: true });
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-accent">Step {step + 1} of {STEP_TITLES.length}</p>
        <h1 className="text-2xl font-semibold text-foreground">Student Onboarding</h1>
        <p className="text-sm text-muted-foreground">Set your profile so YSC can personalize your study flow.</p>
      </div>

      <Card className="border-border/40 bg-card/60">
        <CardHeader>
          <CardTitle className="text-base">{STEP_TITLES[step]}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {step === 0 && (
            <div className="space-y-2">
              <Label htmlFor="grade-level">Current grade level or year</Label>
              <Input
                id="grade-level"
                placeholder="Example: 11th Grade or College Freshman"
                value={profile.grade_level}
                onChange={(event) => setProfile((prev) => ({ ...prev, grade_level: event.target.value }))}
              />
            </div>
          )}

          {step === 1 && (
            <div className="space-y-2">
              <Label htmlFor="subjects">Main subjects</Label>
              <Input
                id="subjects"
                placeholder="Example: Biology, Statistics, Writing"
                value={profile.subjects}
                onChange={(event) => setProfile((prev) => ({ ...prev, subjects: event.target.value }))}
              />
              <p className="text-xs text-muted-foreground">Use commas between subjects.</p>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-2">
              <Label htmlFor="weekly-goal">Weekly study goal (hours)</Label>
              <Input
                id="weekly-goal"
                type="number"
                min={1}
                max={80}
                value={profile.weekly_goal_hours}
                onChange={(event) =>
                  setProfile((prev) => ({
                    ...prev,
                    weekly_goal_hours: event.target.value,
                  }))
                }
              />
            </div>
          )}

          {step === 3 && (
            <div className="space-y-2">
              <Label htmlFor="study-preferences">Study preferences (optional)</Label>
              <Input
                id="study-preferences"
                placeholder="Example: Night study, short sessions, quiz-heavy"
                value={profile.study_preferences}
                onChange={(event) =>
                  setProfile((prev) => ({
                    ...prev,
                    study_preferences: event.target.value,
                  }))
                }
              />
            </div>
          )}

          {step === 4 && (
            <div className="space-y-2">
              <Label htmlFor="timezone">Timezone</Label>
              <Input
                id="timezone"
                placeholder="Example: America/New_York"
                value={profile.timezone}
                onChange={(event) => setProfile((prev) => ({ ...prev, timezone: event.target.value }))}
              />
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <Button variant="outline" className="border-border/50" onClick={previousStep} disabled={step === 0}>
              <ChevronLeft className="mr-2 h-4 w-4" />
              Back
            </Button>

            {step < STEP_TITLES.length - 1 ? (
              <Button onClick={nextStep} className="bg-accent text-accent-foreground hover:bg-accent/90">
                Next
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            ) : (
              <Button onClick={finishOnboarding} className="bg-accent text-accent-foreground hover:bg-accent/90">
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Finish
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
