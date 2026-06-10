import { useCallback, useEffect, useMemo, useState } from "react";
import { addDays, addWeeks, format, isSameDay, startOfWeek } from "date-fns";
import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  Loader2,
  Plus,
  Trash2,
  WandSparkles,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import SubjectPicker from "@/components/SubjectPicker";

import {
  fetchBlocks,
  createBlock,
  createBlocksBulk,
  completeBlock,
  deleteBlock,
  fetchSuggestions,
} from "@/lib/plannerApi";
import { fetchSubjects, createSubject } from "@/lib/tasksApi";

const EMPTY_FORM = {
  title: "",
  goal: "",
  subject_id: "",
  day: "",
  start_time: "16:00",
  duration_minutes: "45",
};

const DURATION_OPTIONS = ["25", "45", "60", "90", "120"];

export default function StudyPlanner() {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [blocks, setBlocks] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const [suggestions, setSuggestions] = useState(null); // null = dialog closed
  const [selectedSuggestions, setSelectedSuggestions] = useState({});
  const [suggestLoading, setSuggestLoading] = useState(false);

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );

  // ── Data loading ─────────────────────────────────────────────────────

  const loadBlocks = useCallback(async () => {
    setLoading(true);
    try {
      const [blocksRes, subjectsRes] = await Promise.all([
        fetchBlocks({
          start: weekStart.toISOString(),
          end: addWeeks(weekStart, 1).toISOString(),
        }),
        fetchSubjects().catch(() => ({ subjects: [] })),
      ]);
      setBlocks(blocksRes.blocks || []);
      setSubjects(subjectsRes.subjects || []);
    } catch (err) {
      toast.error("Could not load planner", { description: err.message });
    } finally {
      setLoading(false);
    }
  }, [weekStart]);

  useEffect(() => {
    loadBlocks();
  }, [loadBlocks]);

  // ── Handlers ─────────────────────────────────────────────────────────

  const openCreate = (day) => {
    setForm({
      ...EMPTY_FORM,
      day: format(day || weekDays[0], "yyyy-MM-dd"),
    });
    setShowCreate(true);
  };

  const handleCreate = async () => {
    if (!form.title.trim() || !form.day) return;
    setSaving(true);
    try {
      const start = new Date(`${form.day}T${form.start_time || "16:00"}:00`);
      const end = new Date(start.getTime() + Number(form.duration_minutes || 45) * 60000);
      const payload = {
        title: form.title.trim(),
        scheduled_start: start.toISOString(),
        scheduled_end: end.toISOString(),
      };
      if (form.goal.trim()) payload.goal = form.goal.trim();
      if (form.subject_id) payload.subject_id = form.subject_id;

      await createBlock(payload);
      toast.success("Study block added");
      setShowCreate(false);
      setForm(EMPTY_FORM);
      await loadBlocks();
    } catch (err) {
      toast.error("Could not add study block", { description: err.message });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleComplete = async (block) => {
    try {
      await completeBlock(block.id, !block.completed);
      await loadBlocks();
    } catch (err) {
      toast.error("Could not update block", { description: err.message });
    }
  };

  const handleDelete = async (block) => {
    try {
      await deleteBlock(block.id);
      toast.success("Study block removed");
      await loadBlocks();
    } catch (err) {
      toast.error("Could not delete block", { description: err.message });
    }
  };

  const handleOpenSuggestions = async () => {
    setSuggestLoading(true);
    try {
      const res = await fetchSuggestions();
      const items = res.suggestions || [];
      setSuggestions(items);
      setSelectedSuggestions(
        Object.fromEntries(items.map((_, index) => [index, true]))
      );
      if (items.length === 0) {
        toast.info("No suggestions right now", {
          description: "Add assignments with due dates to get study block suggestions.",
        });
        setSuggestions(null);
      }
    } catch (err) {
      toast.error("Could not load suggestions", { description: err.message });
    } finally {
      setSuggestLoading(false);
    }
  };

  const handleAcceptSuggestions = async () => {
    const chosen = (suggestions || []).filter((_, index) => selectedSuggestions[index]);
    if (chosen.length === 0) {
      setSuggestions(null);
      return;
    }
    setSaving(true);
    try {
      await createBlocksBulk(
        chosen.map((s) => ({
          title: s.title,
          goal: s.goal || undefined,
          subject_id: s.subject_id || undefined,
          assignment_id: s.assignment_id || undefined,
          scheduled_start: s.scheduled_start,
          scheduled_end: s.scheduled_end,
          source: "auto_suggest",
        }))
      );
      toast.success(`Added ${chosen.length} study block${chosen.length !== 1 ? "s" : ""}`);
      setSuggestions(null);
      await loadBlocks();
    } catch (err) {
      toast.error("Could not add study blocks", { description: err.message });
    } finally {
      setSaving(false);
    }
  };

  const handleCreateSubject = async (name, color) => {
    try {
      await createSubject({ name, color });
      const res = await fetchSubjects();
      setSubjects(res.subjects || []);
    } catch (err) {
      toast.error("Could not create subject", { description: err.message });
      throw err;
    }
  };

  // ── Derived ──────────────────────────────────────────────────────────

  const subjectMap = useMemo(() => {
    const map = {};
    for (const s of subjects) map[s.id] = s;
    return map;
  }, [subjects]);

  const blocksByDay = useMemo(() => {
    const map = new Map(weekDays.map((day) => [format(day, "yyyy-MM-dd"), []]));
    for (const block of blocks) {
      const key = format(new Date(block.scheduled_start), "yyyy-MM-dd");
      if (map.has(key)) map.get(key).push(block);
    }
    return map;
  }, [blocks, weekDays]);

  const totalPlannedMinutes = useMemo(
    () =>
      blocks.reduce((sum, block) => {
        const start = new Date(block.scheduled_start);
        const end = new Date(block.scheduled_end);
        return sum + Math.max(0, Math.round((end - start) / 60000));
      }, 0),
    [blocks]
  );

  const today = new Date();

  // ── Render ───────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Study Planner</h1>
          <p className="text-sm text-muted-foreground">
            {blocks.length} block{blocks.length !== 1 ? "s" : ""} ·{" "}
            {Math.round(totalPlannedMinutes / 60 * 10) / 10}h planned this week
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="border-border/50"
            disabled={suggestLoading}
            onClick={handleOpenSuggestions}
          >
            {suggestLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <WandSparkles className="mr-2 h-4 w-4" />
            )}
            Auto-Suggest
          </Button>
          <Button
            className="bg-accent text-accent-foreground hover:bg-accent/90"
            onClick={() => openCreate(null)}
          >
            <Plus className="mr-2 h-4 w-4" />
            New Block
          </Button>
        </div>
      </div>

      {/* Week navigation */}
      <div className="flex items-center justify-between rounded-md border border-border/40 bg-card/40 px-3 py-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setWeekStart((w) => addWeeks(w, -1))}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <CalendarDays className="h-4 w-4 text-accent" />
          {format(weekStart, "MMM d")} – {format(addDays(weekStart, 6), "MMM d, yyyy")}
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs text-accent"
            onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}
          >
            Today
          </Button>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setWeekStart((w) => addWeeks(w, 1))}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-accent" />
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
          {weekDays.map((day) => {
            const key = format(day, "yyyy-MM-dd");
            const dayBlocks = blocksByDay.get(key) || [];
            const isToday = isSameDay(day, today);
            return (
              <div key={key} className="space-y-2">
                <div
                  className={`flex items-center justify-between rounded-md px-2 py-1 text-xs font-medium ${
                    isToday ? "bg-accent/20 text-accent" : "text-muted-foreground"
                  }`}
                >
                  <span>{format(day, "EEE d")}</span>
                  <button
                    type="button"
                    className="rounded p-0.5 transition-colors hover:bg-card/80"
                    onClick={() => openCreate(day)}
                    aria-label={`Add block on ${format(day, "EEEE")}`}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>

                {dayBlocks.length === 0 ? (
                  <Card className="border-dashed border-border/30 bg-card/20">
                    <CardContent className="py-4 text-center text-[11px] text-muted-foreground">
                      Free
                    </CardContent>
                  </Card>
                ) : (
                  dayBlocks.map((block) => {
                    const subject = subjectMap[block.subject_id];
                    return (
                      <Card
                        key={block.id}
                        className={`border transition-colors ${
                          block.completed
                            ? "border-emerald-500/30 bg-emerald-500/5"
                            : "border-border/40 bg-card/50"
                        }`}
                      >
                        <CardContent className="space-y-1.5 p-2.5">
                          <div className="flex items-start gap-1.5">
                            <button
                              type="button"
                              className="mt-0.5 shrink-0 text-accent"
                              onClick={() => handleToggleComplete(block)}
                              aria-label={block.completed ? "Mark incomplete" : "Mark complete"}
                            >
                              {block.completed ? (
                                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                              ) : (
                                <Circle className="h-4 w-4" />
                              )}
                            </button>
                            <p
                              className={`flex-1 text-xs font-medium leading-tight ${
                                block.completed
                                  ? "text-muted-foreground line-through"
                                  : "text-foreground"
                              }`}
                            >
                              {block.title}
                            </p>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-5 w-5 shrink-0 p-0 text-red-400 hover:text-red-300"
                              onClick={() => handleDelete(block)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                          <p className="text-[11px] text-muted-foreground">
                            {format(new Date(block.scheduled_start), "h:mm a")} –{" "}
                            {format(new Date(block.scheduled_end), "h:mm a")}
                          </p>
                          {block.goal && (
                            <p className="line-clamp-2 text-[11px] text-muted-foreground">
                              {block.goal}
                            </p>
                          )}
                          <div className="flex items-center gap-1">
                            {subject && (
                              <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
                                {subject.name}
                              </Badge>
                            )}
                            {block.source === "auto_suggest" && (
                              <Badge variant="outline" className="h-4 px-1.5 text-[10px] text-accent">
                                suggested
                              </Badge>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Create block dialog ───────────────────────────────────────── */}
      <Dialog
        open={showCreate}
        onOpenChange={(open) => {
          if (!open) {
            setShowCreate(false);
            setForm(EMPTY_FORM);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New Study Block</DialogTitle>
            <DialogDescription>Reserve time for focused work this week.</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <Label htmlFor="block-title">Title *</Label>
              <Input
                id="block-title"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Algebra problem set"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="block-goal">Goal</Label>
              <Input
                id="block-goal"
                value={form.goal}
                onChange={(e) => setForm((f) => ({ ...f, goal: e.target.value }))}
                placeholder="What will you finish?"
                className="mt-1"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Day *</Label>
                <Select
                  value={form.day}
                  onValueChange={(v) => setForm((f) => ({ ...f, day: v }))}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Pick a day" />
                  </SelectTrigger>
                  <SelectContent>
                    {weekDays.map((day) => (
                      <SelectItem key={format(day, "yyyy-MM-dd")} value={format(day, "yyyy-MM-dd")}>
                        {format(day, "EEEE, MMM d")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="block-start">Start time</Label>
                <Input
                  id="block-start"
                  type="time"
                  value={form.start_time}
                  onChange={(e) => setForm((f) => ({ ...f, start_time: e.target.value }))}
                  className="mt-1"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Duration</Label>
                <Select
                  value={form.duration_minutes}
                  onValueChange={(v) => setForm((f) => ({ ...f, duration_minutes: v }))}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DURATION_OPTIONS.map((minutes) => (
                      <SelectItem key={minutes} value={minutes}>
                        {minutes} minutes
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Subject</Label>
                <SubjectPicker
                  value={form.subject_id || null}
                  onChange={(v) => setForm((f) => ({ ...f, subject_id: v || "" }))}
                  subjects={subjects}
                  onCreate={handleCreateSubject}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowCreate(false);
                setForm(EMPTY_FORM);
              }}
            >
              Cancel
            </Button>
            <Button
              className="bg-accent text-accent-foreground hover:bg-accent/90"
              disabled={saving || !form.title.trim() || !form.day}
              onClick={handleCreate}
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add Block
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Suggestions dialog ────────────────────────────────────────── */}
      <Dialog open={!!suggestions} onOpenChange={(open) => !open && setSuggestions(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Suggested Study Blocks</DialogTitle>
            <DialogDescription>
              Based on assignments due in the next 7 days. Uncheck any you don't want.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-72 space-y-2 overflow-y-auto">
            {(suggestions || []).map((suggestion, index) => (
              <label
                key={`${suggestion.assignment_id}-${index}`}
                className="flex cursor-pointer items-start gap-3 rounded-md border border-border/40 bg-card/40 p-3"
              >
                <Checkbox
                  checked={!!selectedSuggestions[index]}
                  onCheckedChange={(checked) =>
                    setSelectedSuggestions((prev) => ({ ...prev, [index]: !!checked }))
                  }
                  className="mt-0.5"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">{suggestion.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(suggestion.scheduled_start), "EEE MMM d, h:mm a")} –{" "}
                    {format(new Date(suggestion.scheduled_end), "h:mm a")}
                  </p>
                  {suggestion.goal && (
                    <p className="text-[11px] text-muted-foreground">{suggestion.goal}</p>
                  )}
                </div>
                {suggestion.priority && (
                  <Badge variant="outline" className="shrink-0 text-[10px]">
                    {suggestion.priority}
                  </Badge>
                )}
              </label>
            ))}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSuggestions(null)}>
              Cancel
            </Button>
            <Button
              className="bg-accent text-accent-foreground hover:bg-accent/90"
              disabled={saving}
              onClick={handleAcceptSuggestions}
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add Selected
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
