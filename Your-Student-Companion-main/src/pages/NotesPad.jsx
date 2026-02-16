import { Search, StickyNote } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function NotesPad() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Notes Pad</h1>
        <p className="text-sm text-muted-foreground">Subject-linked notes, tags, and flashcards are staged for Module F.</p>
      </div>

      <Card className="border-border/40 bg-card/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <StickyNote className="h-4 w-4 text-accent" />
            Notes Workspace
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search notes by title or tag" className="pl-9" />
          </div>
          <p>
            This route is wired and ready for Supabase CRUD + AI summary actions. Next phase will connect notes,
            review cards, and subject filters.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
