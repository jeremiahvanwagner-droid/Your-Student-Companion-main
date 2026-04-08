import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  Calendar,
  ChevronRight,
  Clock,
  Filter,
  Loader2,
  Plus,
  Trash2,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Textarea } from "@/components/ui/textarea";

import {
  fetchTasks,
  createTask,
  updateTask,
  patchTaskStatus,
  deleteTask,
  fetchSubjects,
  createSubject,
} from "@/lib/tasksApi";

// ── Constants ────────────────────────────────────────────────────────────

const COLUMNS = [
  { key: "not_started", label: "Not Started", color: "bg-muted-foreground/20" },
  { key: "in_progress", label: "In Progress", color: "bg-blue-500/20" },
  { key: "submitted", label: "Submitted", color: "bg-amber-500/20" },
  { key: "completed", label: "Completed", color: "bg-emerald-500/20" },
];

const PRIORITY_COLORS = {
  low: "bg-slate-500/20 text-slate-300",
  medium: "bg-blue-500/20 text-blue-300",
  high: "bg-amber-500/20 text-amber-300",
  urgent: "bg-red-500/20 text-red-300",
};

const NEXT_STATUS = {
  not_started: "in_progress",
  in_progress: "submitted",
  submitted: "completed",
  completed: "completed",
};

const EMPTY_FORM = {
  title: "",
  description: "",
  subject_id: "",
  due_date: "",
  priority: "medium",
  estimated_minutes: "",
};

// ── Component ────────────────────────────────────────────────────────────

export default function TaskManager() {
  const [tasks, setTasks] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // dialogs
  const [showCreate, setShowCreate] = useState(false);
  const [editTask, setEditTask] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [saving, setSaving] = useState(false);

  // filters
  const [filterPriority, setFilterPriority] = useState("");
  const [filterSubject, setFilterSubject] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  // form state
  const [form, setForm] = useState(EMPTY_FORM);

  // new subject inline
  const [newSubjectName, setNewSubjectName] = useState("");

  // ── Data loading ─────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [taskRes, subjectRes] = await Promise.all([
        fetchTasks({ priority: filterPriority || undefined, subjectId: filterSubject || undefined }),
        fetchSubjects(),
      ]);
      setTasks(taskRes.tasks || []);
      setSubjects(subjectRes.subjects || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [filterPriority, filterSubject]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── Handlers ─────────────────────────────────────────────────────────

  const handleCreate = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        priority: form.priority,
      };
      if (form.description.trim()) payload.description = form.description.trim();
      if (form.subject_id) payload.subject_id = form.subject_id;
      if (form.due_date) payload.due_date = form.due_date;
      if (form.estimated_minutes) payload.estimated_minutes = Number(form.estimated_minutes);

      await createTask(payload);
      setShowCreate(false);
      setForm(EMPTY_FORM);
      await loadData();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async () => {
    if (!editTask || !form.title.trim()) return;
    setSaving(true);
    try {
      const payload = { title: form.title.trim(), priority: form.priority };
      if (form.description.trim()) payload.description = form.description.trim();
      if (form.subject_id) payload.subject_id = form.subject_id;
      if (form.due_date) payload.due_date = form.due_date;
      if (form.estimated_minutes) payload.estimated_minutes = Number(form.estimated_minutes);

      await updateTask(editTask.id, payload);
      setEditTask(null);
      setForm(EMPTY_FORM);
      await loadData();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleStatusAdvance = async (task) => {
    const next = NEXT_STATUS[task.status];
    if (next === task.status) return;
    try {
      await patchTaskStatus(task.id, next);
      await loadData();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      await deleteTask(deleteTarget.id);
      setDeleteTarget(null);
      await loadData();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleAddSubject = async () => {
    if (!newSubjectName.trim()) return;
    try {
      await createSubject({ name: newSubjectName.trim() });
      setNewSubjectName("");
      const res = await fetchSubjects();
      setSubjects(res.subjects || []);
    } catch (err) {
      setError(err.message);
    }
  };

  const openEdit = (task) => {
    setForm({
      title: task.title || "",
      description: task.description || "",
      subject_id: task.subject_id || "",
      due_date: task.due_date ? task.due_date.slice(0, 10) : "",
      priority: task.priority || "medium",
      estimated_minutes: task.estimated_minutes ? String(task.estimated_minutes) : "",
    });
    setEditTask(task);
  };

  // group tasks by status
  const grouped = {};
  for (const col of COLUMNS) grouped[col.key] = [];
  for (const t of tasks) {
    const key = t.status || "not_started";
    if (grouped[key]) grouped[key].push(t);
  }

  const subjectMap = {};
  for (const s of subjects) subjectMap[s.id] = s;

  // ── Render ───────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Task Manager</h1>
          <p className="text-sm text-muted-foreground">
            {tasks.length} task{tasks.length !== 1 ? "s" : ""} across {COLUMNS.length} stages
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="border-border/50"
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter className="mr-2 h-4 w-4" />
            Filters
          </Button>
          <Button
            className="bg-accent text-accent-foreground hover:bg-accent/90"
            onClick={() => {
              setForm(EMPTY_FORM);
              setShowCreate(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            New Task
          </Button>
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <Card className="border-border/40 bg-card/50">
          <CardContent className="flex flex-wrap items-end gap-3 pt-4">
            <div className="min-w-[140px]">
              <Label className="text-xs text-muted-foreground">Priority</Label>
              <Select value={filterPriority} onValueChange={setFilterPriority}>
                <SelectTrigger className="mt-1 h-9"><SelectValue placeholder="All" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[160px]">
              <Label className="text-xs text-muted-foreground">Subject</Label>
              <Select value={filterSubject} onValueChange={setFilterSubject}>
                <SelectTrigger className="mt-1 h-9"><SelectValue placeholder="All" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All</SelectItem>
                  {subjects.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setFilterPriority("");
                setFilterSubject("");
              }}
            >
              <X className="mr-1 h-3 w-3" /> Clear
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
          <Button variant="ghost" size="sm" className="ml-auto h-6 px-2" onClick={() => setError(null)}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-accent" />
        </div>
      )}

      {/* Kanban Board */}
      {!loading && (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {COLUMNS.map((col) => (
            <div key={col.key} className="space-y-2">
              <div className="flex items-center gap-2">
                <div className={`h-2 w-2 rounded-full ${col.color}`} />
                <span className="text-sm font-medium text-foreground">{col.label}</span>
                <Badge variant="secondary" className="ml-auto text-xs">
                  {grouped[col.key].length}
                </Badge>
              </div>

              <div className="space-y-2">
                {grouped[col.key].length === 0 && (
                  <Card className="border-dashed border-border/30 bg-card/30">
                    <CardContent className="py-6 text-center text-xs text-muted-foreground">
                      No tasks
                    </CardContent>
                  </Card>
                )}

                {grouped[col.key].map((task) => {
                  const subject = subjectMap[task.subject_id];
                  return (
                    <Card
                      key={task.id}
                      className="cursor-pointer border-border/40 bg-card/50 transition-colors hover:bg-card/80"
                      onClick={() => openEdit(task)}
                    >
                      <CardContent className="space-y-2 p-3">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium leading-tight text-foreground">
                            {task.title}
                          </p>
                          <Badge className={`shrink-0 text-[10px] ${PRIORITY_COLORS[task.priority] || ""}`}>
                            {task.priority}
                          </Badge>
                        </div>

                        {task.description && (
                          <p className="line-clamp-2 text-xs text-muted-foreground">
                            {task.description}
                          </p>
                        )}

                        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                          {task.due_date && (
                            <span className="inline-flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {new Date(task.due_date).toLocaleDateString()}
                            </span>
                          )}
                          {task.estimated_minutes && (
                            <span className="inline-flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {task.estimated_minutes}m
                            </span>
                          )}
                          {subject && (
                            <span className="truncate">{subject.name}</span>
                          )}
                        </div>

                        <div className="flex items-center gap-1 pt-1">
                          {col.key !== "completed" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 gap-1 px-2 text-[11px] text-accent"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleStatusAdvance(task);
                              }}
                            >
                              <ChevronRight className="h-3 w-3" />
                              {COLUMNS.find((c) => c.key === NEXT_STATUS[task.status])?.label}
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="ml-auto h-6 px-2 text-red-400 hover:text-red-300"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteTarget(task);
                            }}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Create / Edit Dialog ──────────────────────────────────────── */}
      <Dialog
        open={showCreate || !!editTask}
        onOpenChange={(open) => {
          if (!open) {
            setShowCreate(false);
            setEditTask(null);
            setForm(EMPTY_FORM);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editTask ? "Edit Task" : "New Task"}</DialogTitle>
            <DialogDescription>
              {editTask ? "Update the assignment details below." : "Add a new assignment to your board."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Read Chapter 5"
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Optional details..."
                className="mt-1"
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="priority">Priority</Label>
                <Select
                  value={form.priority}
                  onValueChange={(v) => setForm((f) => ({ ...f, priority: v }))}
                >
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="subject">Subject</Label>
                <Select
                  value={form.subject_id}
                  onValueChange={(v) => setForm((f) => ({ ...f, subject_id: v }))}
                >
                  <SelectTrigger className="mt-1"><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None</SelectItem>
                    {subjects.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Quick add subject */}
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Label className="text-xs text-muted-foreground">Add new subject</Label>
                <Input
                  value={newSubjectName}
                  onChange={(e) => setNewSubjectName(e.target.value)}
                  placeholder="e.g. Biology 101"
                  className="mt-1 h-8 text-sm"
                  onKeyDown={(e) => e.key === "Enter" && handleAddSubject()}
                />
              </div>
              <Button variant="outline" size="sm" className="h-8" onClick={handleAddSubject}>
                <Plus className="h-3 w-3" />
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="due_date">Due Date</Label>
                <Input
                  id="due_date"
                  type="date"
                  value={form.due_date}
                  onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="est_min">Est. Minutes</Label>
                <Input
                  id="est_min"
                  type="number"
                  min={1}
                  max={1440}
                  value={form.estimated_minutes}
                  onChange={(e) => setForm((f) => ({ ...f, estimated_minutes: e.target.value }))}
                  className="mt-1"
                  placeholder="e.g. 45"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowCreate(false);
                setEditTask(null);
                setForm(EMPTY_FORM);
              }}
            >
              Cancel
            </Button>
            <Button
              className="bg-accent text-accent-foreground hover:bg-accent/90"
              disabled={saving || !form.title.trim()}
              onClick={editTask ? handleUpdate : handleCreate}
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editTask ? "Save Changes" : "Create Task"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation ───────────────────────────────────────── */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Task</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{deleteTarget?.title}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={saving}
              onClick={handleDelete}
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
