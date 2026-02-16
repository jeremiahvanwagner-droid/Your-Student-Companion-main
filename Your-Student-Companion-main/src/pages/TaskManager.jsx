import { Filter, Plus, KanbanSquare } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function TaskManager() {
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Task Manager</h1>
          <p className="text-sm text-muted-foreground">Kanban workflow for assignments is scaffolded and ready for Supabase CRUD wiring.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="border-border/50">
            <Filter className="mr-2 h-4 w-4" />
            Filters
          </Button>
          <Button className="bg-accent text-accent-foreground hover:bg-accent/90">
            <Plus className="mr-2 h-4 w-4" />
            New Task
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {["Not Started", "In Progress", "Submitted", "Completed"].map((column) => (
          <Card key={column} className="min-h-[220px] border-border/40 bg-card/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{column}</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              <KanbanSquare className="mb-2 h-4 w-4 text-accent" />
              Module C will load assignment cards from `assignments` and enable drag/drop status updates.
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
