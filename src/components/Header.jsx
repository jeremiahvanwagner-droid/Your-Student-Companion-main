import { BookOpen, GraduationCap, LogIn, User } from "lucide-react";
import { 
  SignInButton, 
  SignUpButton,
  UserButton, 
  useAuth 
} from "@clerk/clerk-react";
import { Button } from "@/components/ui/button";

// Check if Clerk is configured
const isClerkConfigured = Boolean(process.env.REACT_APP_CLERK_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

// Safe auth hook that returns defaults when Clerk is not configured
const useSafeAuth = () => {
  if (!isClerkConfigured) {
    return { isSignedIn: false, isLoaded: true };
  }
  
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useAuth();
  } catch {
    return { isSignedIn: false, isLoaded: true };
  }
};

const Header = () => {
  const { isSignedIn, isLoaded } = useSafeAuth();

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-md">
      <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <BookOpen className="w-6 h-6 text-accent" />
            <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 bg-accent rounded-full" />
          </div>
          <span className="font-semibold text-foreground text-sm sm:text-base">
            Student Companion
          </span>
        </div>

        {/* Navigation & Auth */}
        <nav className="flex items-center gap-2 sm:gap-4">
          {/* Study Mode Button */}
          <button 
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
            title="Study Mode"
          >
            <GraduationCap className="w-5 h-5" />
          </button>

          {/* Auth Section - Only show if Clerk is configured */}
          {isClerkConfigured && (
            <>
              {!isLoaded ? (
                // Loading state
                <div className="w-8 h-8 rounded-full bg-secondary/50 animate-pulse" />
              ) : isSignedIn ? (
                // Signed in - show user button
                <UserButton 
                  afterSignOutUrl="/"
                  appearance={{
                    elements: {
                      avatarBox: "w-8 h-8",
                      userButtonPopoverCard: "bg-card border border-border/50",
                      userButtonPopoverActionButton: "text-foreground hover:bg-secondary/50",
                      userButtonPopoverActionButtonText: "text-foreground",
                      userButtonPopoverFooter: "hidden",
                    }
                  }}
                />
              ) : (
                // Signed out - show sign in/up buttons
                <div className="flex items-center gap-2">
                  <SignInButton mode="modal">
                    <Button 
                      variant="ghost" 
                      size="sm"
                      className="text-muted-foreground hover:text-foreground gap-1.5"
                      data-testid="sign-in-button"
                    >
                      <LogIn className="w-4 h-4" />
                      <span className="hidden sm:inline">Sign In</span>
                    </Button>
                  </SignInButton>
                  
                  <SignUpButton mode="modal">
                    <Button 
                      size="sm"
                      className="bg-accent text-accent-foreground hover:bg-accent/90 gap-1.5"
                      data-testid="sign-up-button"
                    >
                      <User className="w-4 h-4" />
                      <span className="hidden sm:inline">Sign Up</span>
                    </Button>
                  </SignUpButton>
                </div>
              )}
            </>
          )}
        </nav>
      </div>
    </header>
  );
};

export default Header;
