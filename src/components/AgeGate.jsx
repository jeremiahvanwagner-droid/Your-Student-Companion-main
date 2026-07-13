import { useMemo, useState } from "react";
import { useClerk, useUser } from "@clerk/clerk-react";
import { ShieldCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  AGE_GATE_METADATA_KEY,
  MIN_AGE,
  buildAgeGateMetadata,
  readAgeGate,
} from "@/lib/ageGate";

/**
 * AgeGate — the 13+ launch gate. Sits OUTSIDE AppAccessGuard so age
 * verification strictly precedes onboarding and any profile data fetch (data
 * minimization: we don't touch the backend for a user we haven't age-verified).
 *
 * Decision flow once Clerk has loaded:
 *   not signed in            -> render children (inner AppAccessGuard redirects to /)
 *   signed in, blocked (<13) -> AgeBlockedScreen (no app access; sign-out only)
 *   signed in, not checked   -> DOB form
 *   signed in, eligible      -> render children
 *
 * Verification is stored in Clerk's client-writable `user.unsafeMetadata` under
 * `ageGate` as a coarse bracket + timestamp — never the raw date of birth.
 * See src/lib/ageGate.js for the rationale.
 */

// Same visual treatment as <Input> so the selects read as one control group.
const SELECT_CLASS =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function AgeGateLoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3">
        <div className="h-12 w-12 animate-pulse rounded-2xl bg-accent/20" />
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    </div>
  );
}

export function AgeBlockedScreen({ onSignOut }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <Card className="max-w-md border-border/40 bg-card/60">
        <CardHeader>
          <CardTitle className="text-lg text-foreground">
            You're not old enough for YSC yet
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Your Student Companion is currently available to students aged {MIN_AGE} and
            older. Thanks for your interest — please check back in the future.
          </p>
          <p className="text-xs text-muted-foreground">
            If you believe this is a mistake, a parent or guardian can reach us at{" "}
            <span className="text-foreground">support@truthjblue.com</span>.
          </p>
          <Button
            variant="outline"
            className="border-border/50"
            onClick={onSignOut}
          >
            Sign out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function todayParts() {
  const now = new Date();
  return { year: now.getFullYear() };
}

export default function AgeGate({ children }) {
  const { isLoaded, isSignedIn, user } = useUser();
  const { signOut } = useClerk();

  const [month, setMonth] = useState(""); // "1".."12"
  const [day, setDay] = useState(""); // "1".."31"
  const [year, setYear] = useState(""); // "YYYY"
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const years = useMemo(() => {
    const { year: current } = todayParts();
    const list = [];
    // 100-year window is plenty for a student product and keeps the dropdown sane.
    for (let y = current; y >= current - 100; y -= 1) list.push(y);
    return list;
  }, []);

  const days = useMemo(() => Array.from({ length: 31 }, (_, i) => i + 1), []);

  // Not loaded or signed out: defer entirely to the inner guard. When signed
  // out, AppAccessGuard renders and redirects to "/". We render nothing of our
  // own so there is no flash of the age form for anonymous visitors.
  if (!isLoaded) {
    return <AgeGateLoadingScreen />;
  }
  if (!isSignedIn || !user) {
    return children;
  }

  const status = readAgeGate(user.unsafeMetadata);

  if (status.blocked) {
    return <AgeBlockedScreen onSignOut={() => signOut()} />;
  }

  if (status.eligible) {
    return children;
  }

  // Not yet checked -> collect DOB.
  const dobIso =
    month && day && year
      ? `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
      : "";

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    const meta = buildAgeGateMetadata(dobIso);
    if (!meta) {
      setError("Please enter a valid date of birth.");
      return;
    }

    setIsSaving(true);
    try {
      await user.update({
        unsafeMetadata: {
          ...(user.unsafeMetadata || {}),
          [AGE_GATE_METADATA_KEY]: meta,
        },
      });
      // On success the component re-renders from the updated unsafeMetadata:
      // under-13 -> blocked screen, otherwise -> children. No local nav needed.
    } catch (err) {
      const message = err?.errors?.[0]?.message || err?.message || "Something went wrong.";
      setError(message);
      toast.error("Could not verify your age.", { description: message });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md border-border/40 bg-card/60">
        <CardHeader>
          <div className="flex items-center gap-2 text-accent">
            <ShieldCheck className="h-5 w-5" />
            <p className="text-xs font-medium uppercase tracking-[0.2em]">One quick check</p>
          </div>
          <CardTitle className="text-lg text-foreground">What's your date of birth?</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <p className="text-sm text-muted-foreground">
              We ask so we can keep YSC appropriate for your age. You must be {MIN_AGE} or
              older to create an account.
            </p>

            <fieldset className="space-y-2" disabled={isSaving}>
              <legend className="sr-only">Date of birth</legend>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="dob-month" className="text-xs text-muted-foreground">Month</Label>
                  <select
                    id="dob-month"
                    aria-label="Birth month"
                    className={cn(SELECT_CLASS)}
                    value={month}
                    onChange={(e) => setMonth(e.target.value)}
                  >
                    <option value="">Month</option>
                    {MONTHS.map((name, index) => (
                      <option key={name} value={String(index + 1)}>{name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="dob-day" className="text-xs text-muted-foreground">Day</Label>
                  <select
                    id="dob-day"
                    aria-label="Birth day"
                    className={cn(SELECT_CLASS)}
                    value={day}
                    onChange={(e) => setDay(e.target.value)}
                  >
                    <option value="">Day</option>
                    {days.map((d) => (
                      <option key={d} value={String(d)}>{d}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="dob-year" className="text-xs text-muted-foreground">Year</Label>
                  <select
                    id="dob-year"
                    aria-label="Birth year"
                    className={cn(SELECT_CLASS)}
                    value={year}
                    onChange={(e) => setYear(e.target.value)}
                  >
                    <option value="">Year</option>
                    {years.map((y) => (
                      <option key={y} value={String(y)}>{y}</option>
                    ))}
                  </select>
                </div>
              </div>
            </fieldset>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button
              type="submit"
              className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
              disabled={isSaving}
            >
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Verifying...
                </>
              ) : (
                "Continue"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
