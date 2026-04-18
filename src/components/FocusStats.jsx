import { useEffect, useState } from "react";
import { Trophy } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { fetchFocusStats } from "@/lib/focusApi";

const STORAGE_KEY = "studentCompanion_minutesFocused";

const FocusStats = () => {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    let mounted = true;
    fetchFocusStats()
      .then((data) => {
        if (!mounted) return;
        setStats(data);
      })
      .catch(() => {
        if (!mounted) return;
        const local = parseInt(localStorage.getItem(STORAGE_KEY) || "0", 10);
        setStats({
          total_focus_minutes: local,
          total_sessions: Math.floor(local / 25),
          total_hours: parseFloat((local / 60).toFixed(1)),
        });
      });
    return () => { mounted = false; };
  }, []);

  if (!stats || stats.total_focus_minutes === 0) return null;

  const totalMinutes = stats.total_focus_minutes;
  const totalSessions = stats.total_sessions;
  const totalHours = stats.total_hours ?? parseFloat((totalMinutes / 60).toFixed(1));

  return (
    <Card className="bg-card/50 border-border/30">
      <CardContent className="py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-accent/10">
              <Trophy className="w-4 h-4 text-accent" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Focus Time</p>
              <p className="text-lg font-semibold text-foreground">
                {totalMinutes} <span className="text-sm font-normal text-muted-foreground">minutes</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 text-sm">
            <div className="text-center">
              <p className="text-foreground font-medium">{totalSessions}</p>
              <p className="text-xs text-muted-foreground">Sessions</p>
            </div>
            <div className="w-px h-8 bg-border/50" />
            <div className="text-center">
              <p className="text-foreground font-medium">{totalHours}h</p>
              <p className="text-xs text-muted-foreground">Hours</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default FocusStats;
