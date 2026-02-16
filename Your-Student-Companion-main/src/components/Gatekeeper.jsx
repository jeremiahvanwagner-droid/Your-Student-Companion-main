import { useAuth } from '@clerk/clerk-react';
import HomePage from '@/pages/HomePage';
import LandingPage from '@/pages/LandingPage';

/**
 * Gatekeeper Component
 * 
 * Controls access to the app based on authentication status:
 * - Signed Out: Shows the Landing Page (marketing/welcome)
 * - Signed In: Shows the App Dashboard (HomePage with Orb/Search)
 */
const GatekeeperContent = () => {
  const { isSignedIn, isLoaded } = useAuth();

  // Show loading state while Clerk initializes
  if (!isLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          {/* Animated loading orb */}
          <div className="w-16 h-16 rounded-2xl bg-accent/20 flex items-center justify-center animate-pulse">
            <div className="w-8 h-8 rounded-xl bg-accent/40 animate-ping" />
          </div>
          <p className="text-muted-foreground text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  // Route based on authentication status
  if (isSignedIn) {
    return <HomePage />;
  }

  return <LandingPage />;
};

// Wrapper that checks if Clerk is configured
const Gatekeeper = () => {
  // Check if Clerk publishable key exists
  const clerkPubKey = process.env.REACT_APP_CLERK_PUBLISHABLE_KEY;
  
  // If no Clerk key, show landing page without auth gating
  if (!clerkPubKey) {
    return <LandingPage />;
  }
  
  return <GatekeeperContent />;
};

export default Gatekeeper;
