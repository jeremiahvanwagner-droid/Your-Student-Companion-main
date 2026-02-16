import { CalendarDays, WandSparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function StudyPlanner() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Study Planner</h1>
        <p className="text-sm text-muted-foreground">Weekly calendar and auto-suggested study blocks will land in Module D.</p>
      </div>

      <Card className="border-border/40 bg-card/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarDays className="h-4 w-4 text-accent" />
            Weekly Planning Canvas
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            This scaffold reserves the planner route and layout while task-based scheduling logic is connected to
            Supabase assignments and study sessions.
          </p>
          <Button variant="outline" className="border-border/50">
            <WandSparkles className="mr-2 h-4 w-4" />
            Auto-Suggest Study Blocks
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
