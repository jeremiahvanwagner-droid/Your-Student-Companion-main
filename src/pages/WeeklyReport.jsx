import { BarChart3, TrendingUp } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function WeeklyReport() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Weekly Report</h1>
        <p className="text-sm text-muted-foreground">Trend charts and AI next-week planning will be connected in Module H.</p>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card className="border-border/40 bg-card/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="h-4 w-4 text-accent" />
              Focus + Task Trend
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Recharts visualizations will render from `study_sessions`, `focus_logs`, and `assignments`.
          </CardContent>
        </Card>

        <Card className="border-border/40 bg-card/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4 text-accent" />
              Next Week Plan
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            AI-generated planning prompts will populate here once mentor analytics endpoints are live.
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
