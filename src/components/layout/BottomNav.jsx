import { NavLink } from "react-router-dom";
import { CheckSquare, Home, MessageCircle, ShoppingBag, Timer } from "lucide-react";

import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { to: "/app/dashboard", label: "Home", icon: Home },
  { to: "/app/tasks", label: "Tasks", icon: CheckSquare },
  { to: "/app/focus", label: "Focus", icon: Timer },
  { to: "/app/mentor", label: "Mentor", icon: MessageCircle },
  { to: "/app/store", label: "Store", icon: ShoppingBag },
];

export default function BottomNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/95 backdrop-blur lg:hidden">
      <div className="grid h-16 grid-cols-5 px-1 pb-[env(safe-area-inset-bottom)]">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                "flex flex-col items-center justify-center gap-1 rounded-md text-[11px] transition-colors",
                isActive
                  ? "text-accent"
                  : "text-muted-foreground hover:text-foreground"
              )
            }
          >
            <Icon className="h-4 w-4" />
            <span>{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
