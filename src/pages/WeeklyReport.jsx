import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { format, parseISO } from "date-fns";
import {
  AlertCircle,
  ArrowRight,
  BarChart3,
  BookOpen,
  CheckCircle2,
  Loader2,
  MessageCircle,
  Save,
  Timer,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { fetchCurrentWeekReport, generateWeeklyReport, fetchReportHistory } from "@/lib/reportsApi";

const CHART_COLORS = {
  focus: "hsl(166, 100%, 70%)",
  tasks: "hsl(217, 91%, 60%)",
  grid: "hsl(217, 40%, 22%)",
  text: "hsl(226, 40%, 60%)",
};

const TOOLTIP_STYLE = {
  backgroundColor: "hsl(217, 55%, 14%)",
  border: "1px solid hsl(217, 40%, 22%)",
  borderRadius: "8px",
  fontSize: "12px",
};

export default function WeeklyReport() {
  const [report, setReport] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [savingSnapshot, setSavingSnapshot] = useState(false);

  const loadReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [currentRes, historyRes] = await Promise.all([
        fetchCurrentWeekReport(),
        fetchReportHistory({ limit: 12 }).catch(() => ({ reports: [] })),
      ]);
      setReport(currentRes.report);
      setHistory((historyRes.reports || []).slice().reverse());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const handleSaveSnapshot = async () => {
    setSavingSnapshot(true);
    try {
      await generateWeeklyReport();
      toast.success("Weekly snapshot saved");
      const historyRes = await fetchReportHistory({ limit: 12 }).catch(() => ({ reports: [] }));
      setHistory((historyRes.reports || []).slice().reverse());
    } catch (err) {
      toast.error("Could not save snapshot", { description: err.message });
    } finally {
      setSavingSnapshot(false);
    }
  };

  const summaryCards = report
    ? [
        {
          label: "Tasks Completed",
          value: String(report.tasks_completed),
          icon: CheckCircle2,
          accent: report.tasks_completed > 0 ? "text-emerald-400" : "text-muted-foreground",
        },
        {
          label: "Focus Minutes",
          value: String(report.focus_minutes_total),
          icon: Timer,
          accent: report.focus_minutes_total > 0 ? "text-accent" : "text-muted-foreground",
        },
        {
          label: "Top Subject",
          value: report.top_subject || "—",
          icon: BookOpen,
          accent: "text-blue-400",
        },
        {
          label: "Missed",
          value: String(report.tasks_missed),
          icon: AlertCircle,
          accent: report.tasks_missed > 0 ? "text-red-400" : "text-emerald-400",
        },
      ]
    : [];

  const dailyChartData = (report?.daily || []).map((day) => ({
    ...day,
    label: format(parseISO(day.date), "EEE"),
  }));

  const historyChartData = history.map((row) => ({
    week: format(parseISO(row.week_start), "MMM d"),
    focus_minutes: row.focus_minutes_total || 0,
    tasks_completed: row.tasks_completed || 0,
  }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Weekly Report</h1>
          <p className="text-sm text-muted-foreground">
            {report
              ? `Week of ${format(parseISO(report.week_start), "MMM d")} – ${format(
                  parseISO(report.week_end),
                  "MMM d, yyyy"
                )}`
              : "Your week at a glance."}
          </p>
        </div>
        <Button
          variant="outline"
          className="border-border/50"
          disabled={savingSnapshot || loading}
          onClick={handleSaveSnapshot}
        >
          {savingSnapshot ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Save Snapshot
        </Button>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-accent" />
        </div>
      )}

      {error && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {report && !loading && (
        <>
          {/* Summary cards */}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {summaryCards.map((item) => (
              <Card key={item.label} className="border-border/40 bg-card/50">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm text-muted-foreground">
                    <item.icon className={`h-4 w-4 ${item.accent}`} />
                    {item.label}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="truncate text-2xl font-semibold text-foreground">{item.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            {/* Daily breakdown chart */}
            <Card className="border-border/40 bg-card/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <BarChart3 className="h-4 w-4 text-accent" />
                  This Week, Day by Day
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={dailyChartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                      <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="label" tick={{ fill: CHART_COLORS.text, fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: CHART_COLORS.text, fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "hsl(217 40% 22% / 0.3)" }} />
                      <Bar
                        dataKey="focus_minutes"
                        name="Focus min"
                        fill={CHART_COLORS.focus}
                        radius={[3, 3, 0, 0]}
                        maxBarSize={28}
                      />
                      <Line
                        type="monotone"
                        dataKey="tasks_completed"
                        name="Tasks done"
                        stroke={CHART_COLORS.tasks}
                        strokeWidth={2}
                        dot={{ r: 3 }}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-1 flex justify-center gap-4 text-[11px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: CHART_COLORS.focus }} />
                    Focus minutes
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: CHART_COLORS.tasks }} />
                    Tasks completed
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Next week plan */}
            <Card className="border-border/40 bg-card/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <TrendingUp className="h-4 w-4 text-accent" />
                  Next Week Plan
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {report.next_week?.assignments_due > 0 ? (
                  <>
                    <p className="text-sm text-muted-foreground">
                      {report.next_week.assignments_due} assignment
                      {report.next_week.assignments_due !== 1 ? "s" : ""} due next week. Start with
                      these:
                    </p>
                    <div className="space-y-2">
                      {(report.next_week.top_priorities || []).map((task) => (
                        <div
                          key={task.id}
                          className="flex items-center justify-between rounded-md border border-border/30 bg-card/30 px-3 py-2 text-sm"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium text-foreground">{task.title}</p>
                            {task.due_date && (
                              <p className="text-[11px] text-muted-foreground">
                                Due {format(new Date(task.due_date), "EEE MMM d")}
                              </p>
                            )}
                          </div>
                          <Badge variant="outline" className="ml-2 shrink-0 text-[10px]">
                            {task.priority}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Nothing due next week yet. A great time to get ahead or review.
                  </p>
                )}
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button asChild variant="outline" className="border-border/50">
                    <Link to="/app/planner">
                      Plan study blocks
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                  <Button asChild variant="outline" className="border-border/50">
                    <Link to="/app/mentor">
                      <MessageCircle className="mr-2 h-4 w-4" />
                      Ask the Mentor
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Study blocks summary */}
          <Card className="border-border/40 bg-card/50">
            <CardContent className="flex flex-wrap items-center gap-4 py-4 text-sm">
              <span className="text-muted-foreground">Study blocks this week:</span>
              <Badge variant="secondary">{report.blocks_completed} completed</Badge>
              <Badge variant="secondary">{report.blocks_scheduled} scheduled</Badge>
              {report.blocks_scheduled > 0 && (
                <span className="text-muted-foreground">
                  {Math.round((report.blocks_completed / report.blocks_scheduled) * 100)}% follow-through
                </span>
              )}
            </CardContent>
          </Card>

          {/* History trend */}
          <Card className="border-border/40 bg-card/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingUp className="h-4 w-4 text-accent" />
                Week-over-Week Trend
              </CardTitle>
            </CardHeader>
            <CardContent>
              {historyChartData.length < 2 ? (
                <p className="py-4 text-sm text-muted-foreground">
                  Save weekly snapshots to build your trend line. Your first two saved weeks unlock
                  this chart.
                </p>
              ) : (
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={historyChartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                      <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="week" tick={{ fill: CHART_COLORS.text, fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: CHART_COLORS.text, fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} />
                      <Line
                        type="monotone"
                        dataKey="focus_minutes"
                        name="Focus min"
                        stroke={CHART_COLORS.focus}
                        strokeWidth={2}
                        dot={{ r: 3 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="tasks_completed"
                        name="Tasks done"
                        stroke={CHART_COLORS.tasks}
                        strokeWidth={2}
                        dot={{ r: 3 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
