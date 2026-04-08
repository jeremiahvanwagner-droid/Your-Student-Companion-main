import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Clock,
  Flame,
  ListTodo,
  Loader2,
  MessageCircle,
  Timer,
  TrendingUp,
} from "lucide-react";

import TruthLine from "@/components/TruthLine";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

import { fetchTasks, fetchTaskStats } from "@/lib/tasksApi";

const QUICK_ACTIONS = [
  { to: "/app/tasks", label: "Add Task", icon: ListTodo },
  { to: "/app/focus", label: "Start Focus", icon: Timer },
  { to: "/app/mentor", label: "Ask AI", icon: MessageCircle },
];

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [todayTasks, setTodayTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [statsRes, tasksRes] = await Promise.all([
        fetchTaskStats(),
        fetchTasks({ status: "not_started,in_progress", limit: 5 }),
      ]);
      setStats(statsRes);
      setTodayTasks(tasksRes.tasks || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const SNAPSHOT_CARDS = stats
    ? [
        {
          label: "Completion Rate",
          value: `${stats.completion_rate}%`,
          icon: TrendingUp,
          accent: stats.completion_rate >= 70 ? "text-emerald-400" : "text-amber-400",
        },
        {
          label: "Current Streak",
          value: `${stats.streak} day${stats.streak !== 1 ? "s" : ""}`,
          icon: Flame,
          accent: stats.streak >= 3 ? "text-orange-400" : "text-muted-foreground",
        },
        {
          label: "Overdue",
          value: String(stats.overdue),
          icon: AlertCircle,
          accent: stats.overdue > 0 ? "text-red-400" : "text-emerald-400",
        },
      ]
    : [];

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

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-accent" />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Metrics */}
      {stats && !loading && (
        <>
          <div className="grid gap-3 lg:grid-cols-3">
            {SNAPSHOT_CARDS.map((item) => (
              <Card key={item.label} className="border-border/40 bg-card/50">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm text-muted-foreground">
                    <item.icon className={`h-4 w-4 ${item.accent}`} />
                    {item.label}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-semibold text-foreground">{item.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Progress bar */}
          <Card className="border-border/40 bg-card/50">
            <CardContent className="flex items-center gap-4 py-4">
              <div className="flex-1 space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{stats.completed} completed</span>
                  <span>{stats.total} total</span>
                </div>
                <Progress value={stats.total > 0 ? (stats.completed / stats.total) * 100 : 0} className="h-2" />
              </div>
              <div className="flex gap-2 text-xs">
                <Badge variant="secondary">{stats.in_progress} active</Badge>
                <Badge variant="secondary">{stats.not_started} queued</Badge>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Today's tasks + due soon */}
      {!loading && (
        <div className="grid gap-3 lg:grid-cols-2">
          <Card className="border-border/40 bg-card/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CheckCircle2 className="h-4 w-4 text-accent" />
                Active Tasks
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {todayTasks.length === 0 ? (
                <p className="text-sm text-muted-foreground">No active tasks. Great job!</p>
              ) : (
                todayTasks.map((task) => (
                  <Link
                    key={task.id}
                    to="/app/tasks"
                    className="flex items-center justify-between rounded-md border border-border/30 bg-card/30 px-3 py-2 text-sm transition-colors hover:bg-card/60"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-foreground">{task.title}</p>
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                        {task.due_date && (
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {new Date(task.due_date).toLocaleDateString()}
                          </span>
                        )}
                        <Badge variant="outline" className="h-4 text-[10px]">
                          {task.priority}
                        </Badge>
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </Link>
                ))
              )}
              <Button asChild variant="outline" className="mt-2 w-full border-border/50">
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
              <p>Planner integrations are scaffolded and ready for Phase 2.</p>
              <Button asChild variant="outline" className="border-border/50">
                <Link to="/app/planner">Open Planner</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
