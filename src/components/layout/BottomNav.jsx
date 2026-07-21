import { NavLink } from "react-router-dom";
import { CheckSquare, FileText, Home, MessageCircle, ShoppingBag, Timer } from "lucide-react";

import { cn } from "@/lib/utils";
import { isAndroidTwa } from "@/lib/platform";

const NAV_ITEMS = [
  { to: "/app/dashboard", label: "Home", icon: Home },
  { to: "/app/tasks", label: "Tasks", icon: CheckSquare },
  { to: "/app/focus", label: "Focus", icon: Timer },
  { to: "/app/mentor", label: "Mentor", icon: MessageCircle },
  { to: "/app/store", label: "Store", icon: ShoppingBag },
];

// Consumption-only Android build (Play payments policy): swap the Store
// slot for Notes so the grid stays balanced with no purchase surface.
const TWA_NAV_ITEMS = [
  ...NAV_ITEMS.slice(0, 4),
  { to: "/app/notes", label: "Notes", icon: FileText },
];

export default function BottomNav() {
  const items = isAndroidTwa() ? TWA_NAV_ITEMS : NAV_ITEMS;
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/95 backdrop-blur lg:hidden">
      <div className="grid h-16 grid-cols-5 px-1 pb-[env(safe-area-inset-bottom)]">
        {items.map(({ to, label, icon: Icon }) => (
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
