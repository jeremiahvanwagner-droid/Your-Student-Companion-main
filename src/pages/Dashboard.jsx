import { Link } from "react-router-dom";
import { ArrowRight, CalendarClock, CheckCircle2, ListTodo, MessageCircle, Timer } from "lucide-react";

import TruthLine from "@/components/TruthLine";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const QUICK_ACTIONS = [
  { to: "/app/tasks", label: "Add Task", icon: ListTodo },
  { to: "/app/focus", label: "Start Focus", icon: Timer },
  { to: "/app/mentor", label: "Ask AI", icon: MessageCircle },
];

const SNAPSHOT_CARDS = [
  { label: "Completion Rate", value: "--%", hint: "Assignment metrics connect in Phase 3." },
  { label: "Current Streak", value: "--", hint: "Focus streaks connect in Phase 3." },
  { label: "Weekly Consistency", value: "--%", hint: "Weekly reports connect in Phase 3." },
];

export default function Dashboard() {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-accent">Today View</p>
        <h1 className="text-2xl font-semibold text-foreground">Student Dashboard</h1>
        <p className="text-sm text-muted-foreground">Track priorities, stay focused, and move your day forward.</p>
      </div>

      <Card className="border-border/40 bg-card/40">
        <CardContent className="py-4">
          <TruthLine />
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-3">
        {QUICK_ACTIONS.map(({ to, label, icon: Icon }) => (
          <Button key={to} asChild className="h-11 justify-between bg-accent text-accent-foreground hover:bg-accent/90">
            <Link to={to}>
              <span className="inline-flex items-center gap-2">
                <Icon className="h-4 w-4" />
                {label}
              </span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        {SNAPSHOT_CARDS.map((item) => (
          <Card key={item.label} className="border-border/40 bg-card/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">{item.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-foreground">{item.value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{item.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card className="border-border/40 bg-card/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CheckCircle2 className="h-4 w-4 text-accent" />
              Top 3 Priorities
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>Connect assignment data in Module C to show live priorities.</p>
            <Button asChild variant="outline" className="border-border/50">
              <Link to="/app/tasks">Open Task Manager</Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="border-border/40 bg-card/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarClock className="h-4 w-4 text-accent" />
              Due Soon + Study Blocks
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>Planner integrations are scaffolded and ready for Supabase-backed schedule data.</p>
            <Button asChild variant="outline" className="border-border/50">
              <Link to="/app/planner">Open Planner</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
