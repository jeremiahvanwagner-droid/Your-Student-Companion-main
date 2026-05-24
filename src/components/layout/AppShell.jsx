import { Bell, BookOpen, CalendarRange, CheckSquare, CreditCard, FileText, LayoutDashboard, MessageCircle, Settings, ShoppingBag, Sparkles, Timer } from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";
import { UserButton, useAuth } from "@clerk/clerk-react";

import BottomNav from "@/components/layout/BottomNav";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const isClerkConfigured = Boolean(process.env.REACT_APP_CLERK_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

const MAIN_NAV = [
  { to: "/app/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/app/tasks", label: "Tasks", icon: CheckSquare },
  { to: "/app/planner", label: "Planner", icon: CalendarRange },
  { to: "/app/focus", label: "Focus", icon: Timer },
  { to: "/app/mentor", label: "Mentor", icon: MessageCircle },
  { to: "/app/store", label: "Store", icon: ShoppingBag },
  { to: "/app/subscribe", label: "Subscribe", icon: CreditCard },
  { to: "/app/notes", label: "Notes", icon: FileText },
  { to: "/app/progress", label: "Progress", icon: Sparkles },
  { to: "/app/settings", label: "Settings", icon: Settings },
];

const LEGACY_TOOLS = [
  { to: "/app/search", label: "Search" },
  { to: "/app/shifter", label: "Shifter" },
];

function ClerkAvatarConfigured() {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) {
    return <div className="h-8 w-8 animate-pulse rounded-full bg-card" />;
  }

  if (!isSignedIn) {
    return (
      <div className="flex h-8 w-8 items-center justify-center rounded-full border border-border/50 bg-card text-xs text-muted-foreground">
        ?
      </div>
    );
  }

  return (
    <UserButton
      afterSignOutUrl="/"
      appearance={{
        elements: {
          avatarBox: "h-8 w-8",
          userButtonPopoverCard: "bg-card border border-border/40",
          userButtonPopoverActionButton: "text-foreground hover:bg-secondary/50",
          userButtonPopoverActionButtonText: "text-foreground",
          userButtonPopoverFooter: "hidden",
        },
      }}
    />
  );
}

function ClerkAvatar() {
  if (!isClerkConfigured) {
    return (
      <div className="flex h-8 w-8 items-center justify-center rounded-full border border-border/50 bg-card text-xs text-muted-foreground">
        G
      </div>
    );
  }

  return <ClerkAvatarConfigured />;
}

export default function AppShell() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
          <NavLink to="/app/dashboard" className="flex items-center gap-2">
            <div className="relative">
              <BookOpen className="h-5 w-5 text-accent" />
              <span className="absolute -bottom-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-accent" />
            </div>
            <span className="text-sm font-semibold sm:text-base">Your Student Companion</span>
          </NavLink>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Notifications">
              <Bell className="h-4 w-4 text-muted-foreground" />
            </Button>
            <ClerkAvatar />
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl gap-6 px-4 pb-20 pt-4 lg:pb-6">
        <aside className="hidden w-60 shrink-0 lg:block">
          <div className="sticky top-20 rounded-xl border border-border/40 bg-card/40 p-3">
            <nav className="space-y-1">
              {MAIN_NAV.map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
                      isActive
                        ? "bg-accent/15 text-accent"
                        : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                    )
                  }
                >
                  <Icon className="h-4 w-4" />
                  <span>{label}</span>
                </NavLink>
              ))}
            </nav>

            <div className="mt-4 border-t border-border/40 pt-3">
              <p className="mb-2 px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Legacy Tools
              </p>
              <div className="space-y-1">
                {LEGACY_TOOLS.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                      cn(
                        "block rounded-lg px-3 py-2 text-sm transition-colors",
                        isActive
                          ? "bg-accent/10 text-accent"
                          : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                      )
                    }
                  >
                    {item.label}
                  </NavLink>
                ))}
              </div>
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>

      <BottomNav />
    </div>
  );
}

