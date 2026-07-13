import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

import { track } from "@/lib/analytics";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useUserPurchasesContext } from "@/context/UserPurchasesContext";
import {
  fetchMyStudentProfile,
  getOnboardingProfile,
  persistMyStudentProfile,
  setOnboardingComplete,
  setOnboardingProfile,
} from "@/lib/onboarding";

const STEP_TITLES = [
  "Grade Level",
  "Subjects",
  "Weekly Goal",
  "Study Preferences",
  "Timezone",
  "Semester Start",
];

function todayIso() {
  // YYYY-MM-DD in local time — matches <input type="date"> format
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const DEFAULT_PROFILE = {
  grade_level: "",
  subjects: "",
  weekly_goal_hours: 10,
  study_preferences: "",
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York",
  semester_start_date: todayIso(),
};

function parseSubjects(rawSubjects) {
  return String(rawSubjects || "")
    .split(",")
    .map((subject) => subject.trim())
    .filter(Boolean);
}

function mapRemoteProfileToForm(remoteProfile) {
  if (!remoteProfile || typeof remoteProfile !== "object") {
    return null;
  }

  const studyPreferences =
    remoteProfile.study_preferences && typeof remoteProfile.study_preferences === "object"
      ? remoteProfile.study_preferences
      : {};

  const subjects = Array.isArray(studyPreferences.subjects)
    ? studyPreferences.subjects.join(", ")
    : typeof studyPreferences.subjects === "string"
      ? studyPreferences.subjects
      : "";

  const studyPreferenceText =
    typeof studyPreferences.notes === "string"
      ? studyPreferences.notes
      : typeof studyPreferences.preference_text === "string"
        ? studyPreferences.preference_text
        : "";

  const semesterStartFromPrefs =
    typeof studyPreferences.semester_start_date === "string"
      ? studyPreferences.semester_start_date
      : "";

  return {
    grade_level: remoteProfile.grade_level || "",
    subjects,
    weekly_goal_hours:
      Number(remoteProfile.weekly_goal_hours) > 0
        ? Number(remoteProfile.weekly_goal_hours)
        : DEFAULT_PROFILE.weekly_goal_hours,
    study_preferences: studyPreferenceText,
    timezone: remoteProfile.timezone || DEFAULT_PROFILE.timezone,
    semester_start_date:
      // Top-level column wins if present (Phase 3); else nested JSON (Phase 2 location)
      remoteProfile.semester_start_date || semesterStartFromPrefs || DEFAULT_PROFILE.semester_start_date,
  };
}

export default function OnboardingFlow() {
  const navigate = useNavigate();
  const { identityLoading, identityError } = useUserPurchasesContext();

  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState(() => ({
    ...DEFAULT_PROFILE,
    ...(getOnboardingProfile() || {}),
  }));
  const [isLoadingRemoteProfile, setIsLoadingRemoteProfile] = useState(false);
  const [remoteProfileChecked, setRemoteProfileChecked] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let isMounted = true;

    if (identityLoading || remoteProfileChecked) {
      return () => {
        isMounted = false;
      };
    }

    const loadRemoteProfile = async () => {
      setIsLoadingRemoteProfile(true);

      try {
        const payload = await fetchMyStudentProfile();
        const remoteProfile = payload?.profile;
        const mappedProfile = mapRemoteProfileToForm(remoteProfile);

        if (!isMounted || !mappedProfile) {
          return;
        }

        setProfile((previous) => ({
          ...previous,
          ...mappedProfile,
        }));

        setOnboardingProfile({
          ...mappedProfile,
          updated_at: new Date().toISOString(),
        });
      } catch (error) {
        if (isMounted) {
          toast.error("Could not load saved onboarding profile.", {
            description: error?.message || "Please continue and save again.",
          });
        }
      } finally {
        if (isMounted) {
          setIsLoadingRemoteProfile(false);
          setRemoteProfileChecked(true);
        }
      }
    };

    loadRemoteProfile();

    return () => {
      isMounted = false;
    };
  }, [identityLoading, remoteProfileChecked]);

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
    if (step === 5) {
      return Boolean(profile.semester_start_date?.trim());
    }
    return true;
  }, [profile, step]);

  const isBusy = identityLoading || isLoadingRemoteProfile || isSaving;

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

  const finishOnboarding = async () => {
    if (!canProceed) {
      toast.error("Please complete all required fields.");
      return;
    }

    if (identityLoading) {
      toast.error("Your account is still syncing.", {
        description: "Please wait a moment and try again.",
      });
      return;
    }

    const normalizedProfile = {
      ...profile,
      grade_level: profile.grade_level?.trim() || "",
      subjects: profile.subjects?.trim() || "",
      study_preferences: profile.study_preferences?.trim() || "",
      timezone: profile.timezone?.trim() || DEFAULT_PROFILE.timezone,
      weekly_goal_hours: Number(profile.weekly_goal_hours) || 10,
      semester_start_date:
        profile.semester_start_date?.trim() || DEFAULT_PROFILE.semester_start_date,
    };

    setIsSaving(true);

    try {
      await persistMyStudentProfile({
        grade_level: normalizedProfile.grade_level,
        weekly_goal_hours: normalizedProfile.weekly_goal_hours,
        timezone: normalizedProfile.timezone,
        study_preferences: {
          subjects: parseSubjects(normalizedProfile.subjects),
          notes: normalizedProfile.study_preferences || null,
          // Phase 2: nested in study_preferences (no schema change required).
          // Phase 3 will promote this to a top-level student_profiles.semester_start_date column.
          semester_start_date: normalizedProfile.semester_start_date,
        },
        onboarding_completed: true,
      });

      setOnboardingProfile({
        ...normalizedProfile,
        updated_at: new Date().toISOString(),
      });
      setOnboardingComplete(true);
      track("onboarding_complete");

      toast.success("Onboarding completed", {
        description: "Your dashboard is ready.",
      });

      navigate("/app/dashboard", { replace: true });
    } catch (error) {
      toast.error("Could not save onboarding profile.", {
        description: error?.message || "Try again in a moment.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-accent">Step {step + 1} of {STEP_TITLES.length}</p>
        <h1 className="text-2xl font-semibold text-foreground">Student Onboarding</h1>
        <p className="text-sm text-muted-foreground">Set your profile so YSC can personalize your study flow.</p>
        {isLoadingRemoteProfile && (
          <p className="mt-2 text-xs text-muted-foreground">Loading your saved profile...</p>
        )}
        {!identityLoading && identityError && (
          <p className="mt-2 text-xs text-amber-300">Identity sync warning: {identityError}</p>
        )}
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

          {step === 5 && (
            <div className="space-y-2">
              <Label htmlFor="semester-start-date">Semester start date</Label>
              <Input
                id="semester-start-date"
                type="date"
                value={profile.semester_start_date}
                onChange={(event) =>
                  setProfile((prev) => ({ ...prev, semester_start_date: event.target.value }))
                }
              />
              <p className="text-xs text-muted-foreground">
                This anchors your Truth-Line. Pick the first day of classes — defaults to today
                if you're not sure.
              </p>
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <Button
              variant="outline"
              className="border-border/50"
              onClick={previousStep}
              disabled={step === 0 || isBusy}
            >
              <ChevronLeft className="mr-2 h-4 w-4" />
              Back
            </Button>

            {step < STEP_TITLES.length - 1 ? (
              <Button
                onClick={nextStep}
                className="bg-accent text-accent-foreground hover:bg-accent/90"
                disabled={isBusy}
              >
                Next
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            ) : (
              <Button
                onClick={finishOnboarding}
                className="bg-accent text-accent-foreground hover:bg-accent/90"
                disabled={isBusy}
              >
                <CheckCircle2 className="mr-2 h-4 w-4" />
                {isSaving ? "Saving..." : "Finish"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
