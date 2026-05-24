import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";
import { ArrowLeft, Compass, Home } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * 404 page rendered for any unrecognized URL.
 *
 * Replaces the previous catch-all redirect to `/`, which silently sent users
 * back to the gatekeeper and re-redirected — making the browser back button
 * skip intermediate states and creating a "navigation went somewhere weird"
 * feeling. The dedicated 404 stays on the unknown URL so back/forward work
 * normally.
 */
export default function NotFoundPage() {
  const location = useLocation();
  // NotFoundPage is only mounted inside ClerkProvider (App.js renders
  // LandingPage-only when Clerk isn't configured), so useAuth is safe here.
  const { isSignedIn } = useAuth();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="max-w-md space-y-4 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/15">
          <Compass className="h-7 w-7 text-accent" />
        </div>
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-accent">404</p>
          <h1 className="text-2xl font-semibold text-foreground">Page not found</h1>
          <p className="text-sm text-muted-foreground">
            We couldn't find <code className="rounded bg-card px-1.5 py-0.5 text-xs">{location.pathname}</code>.
            It may have moved, or the link is no longer valid.
          </p>
        </div>
        <div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-center">
          {isSignedIn ? (
            <Button asChild className="bg-accent text-accent-foreground hover:bg-accent/90">
              <Link to="/app/dashboard">
                <Home className="mr-2 h-4 w-4" />
                Go to Dashboard
              </Link>
            </Button>
          ) : (
            <Button asChild className="bg-accent text-accent-foreground hover:bg-accent/90">
              <Link to="/">
                <Home className="mr-2 h-4 w-4" />
                Back to Home
              </Link>
            </Button>
          )}
          <Button
            asChild
            variant="outline"
            className="border-border/50"
          >
            <Link to="/">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Landing Page
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
