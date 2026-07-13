import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Archive,
  ArchiveRestore,
  Check,
  ChevronDown,
  ChevronRight,
  Loader2,
  RotateCcw,
  Save,
  Settings,
  ShieldAlert,
  User,
} from "lucide-react";
import { useClerk } from "@clerk/clerk-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
  fetchMyStudentProfile,
  persistMyStudentProfile,
  setOnboardingComplete,
} from "@/lib/onboarding";
import { deleteMyAccount } from "@/lib/accountApi";
import { track } from "@/lib/analytics";
import {
  createSubject,
  fetchSubjects,
  fetchTasks,
  patchSubject,
} from "@/lib/tasksApi";
import { SUBJECT_COLORS } from "@/components/SubjectPicker";

// ── Constants ─────────────────────────────────────────────────────────────

const YEAR_LEVELS = [
  { value: "freshman", label: "Freshman" },
  { value: "sophomore", label: "Sophomore" },
  { value: "junior", label: "Junior" },
  { value: "senior", label: "Senior" },
  { value: "other", label: "Other" },
];

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "America/Phoenix",
  "America/Indiana/Indianapolis",
  "America/Puerto_Rico",
];

// ── SubjectRow ─────────────────────────────────────────────────────────────

function SubjectRow({ subject, taskCount, onRename, onRecolor, onArchive, onRestore }) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(subject.name);
  const [showColors, setShowColors] = useState(false);
  const inputRef = useRef(null);

  const handleBlur = async () => {
    setEditing(false);
    const trimmed = editName.trim();
    if (trimmed && trimmed !== subject.name) {
      await onRename(subject.id, trimmed);
    } else {
      setEditName(subject.name);
    }
  };

  const startEdit = () => {
    setEditName(subject.name);
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  return (
    <div
      className="flex items-center gap-2 rounded-lg border border-border/40 bg-card/40 px-3 py-2"
      data-testid={`subject-row-${subject.id}`}
    >
      {/* Color swatch — click to open palette */}
      <button
        type="button"
        className="h-4 w-4 rounded-full flex-shrink-0 border-2 border-transparent hover:border-foreground/30 transition-all"
        style={{ backgroundColor: subject.color || "#64748b" }}
        onClick={() => setShowColors((v) => !v)}
        title="Change color"
        data-testid="subject-color-btn"
      />

      {/* Name — click to edit */}
      {editing ? (
        <Input
          ref={inputRef}
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={(e) => {
            if (e.key === "Enter") inputRef.current?.blur();
            if (e.key === "Escape") {
              setEditName(subject.name);
              setEditing(false);
            }
          }}
          className="h-6 flex-1 border-accent/40 bg-transparent text-sm p-1"
          data-testid="subject-rename-input"
        />
      ) : (
        <button
          type="button"
          className="flex-1 text-left text-sm text-foreground hover:text-accent transition-colors"
          onClick={startEdit}
          data-testid="subject-name-btn"
        >
          {subject.name}
        </button>
      )}

      {/* Task count badge */}
      {taskCount > 0 && (
        <Badge variant="secondary" className="text-[10px] px-1.5 py-0.5">
          {taskCount}
        </Badge>
      )}

      {/* Archive / restore */}
      {subject.archived ? (
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-muted-foreground hover:text-foreground"
          onClick={() => onRestore(subject.id)}
          title="Restore subject"
          data-testid="subject-restore-btn"
        >
          <ArchiveRestore className="h-3.5 w-3.5" />
        </Button>
      ) : (
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-muted-foreground hover:text-amber-400"
          onClick={() => onArchive(subject)}
          title="Archive subject"
          data-testid="subject-archive-btn"
        >
          <Archive className="h-3.5 w-3.5" />
        </Button>
      )}

      {/* Inline color palette */}
      {showColors && (
        <div className="absolute z-10 mt-8 flex gap-1 rounded-lg border border-border/50 bg-card p-2 shadow-md">
          {SUBJECT_COLORS.map((c) => (
            <button
              key={c.value}
              type="button"
              title={c.label}
              onClick={async () => {
                setShowColors(false);
                await onRecolor(subject.id, c.value);
              }}
              className={`h-5 w-5 rounded-full border-2 transition-transform hover:scale-110 ${
                subject.color === c.value ? "border-foreground" : "border-transparent"
              }`}
              style={{ backgroundColor: c.value }}
            />
          ))}
          {/* Check icon if current color matches */}
          {subject.color && (
            <button
              type="button"
              className="h-5 w-5 flex items-center justify-center rounded-full border-2 border-transparent text-muted-foreground hover:text-foreground"
              onClick={() => setShowColors(false)}
              title="Close"
            >
              <Check className="h-3 w-3" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export default function UserSettings() {
  const navigate = useNavigate();
  const { signOut } = useClerk();

  // profile state
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);

  // account deletion state
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  const handleDeleteAccount = async () => {
    if (deleteConfirmText.trim().toLowerCase() !== "delete my account") return;
    setDeleting(true);
    try {
      track("account_delete");
      await deleteMyAccount();
      toast.success("Your data has been deleted", {
        description: "Signing you out now.",
      });
      await signOut();
      navigate("/", { replace: true });
    } catch (err) {
      toast.error("Could not delete your account", { description: err.message });
      setDeleting(false);
    }
  };
  // Raw loaded profile — kept so we can merge into nested study_preferences
  // on save without clobbering fields the user didn't edit.
  const [profileData, setProfileData] = useState(null);
  const [form, setForm] = useState({
    display_name: "",
    grade_level: "",
    school: "",
    major: "",
    year_level: "",
    timezone: "America/New_York",
    weekly_goal_hours: 10,
    study_preferences: "",
    semester_start_date: "",
  });

  // subjects state
  const [subjects, setSubjects] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [newSubject, setNewSubject] = useState("");
  const [newSubjectColor, setNewSubjectColor] = useState(SUBJECT_COLORS[1].value);
  const [addingSubject, setAddingSubject] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState(null);
  const [archivingSubject, setArchivingSubject] = useState(false);
  const [archivedOpen, setArchivedOpen] = useState(false);

  const reloadSubjects = async () => {
    const res = await fetchSubjects({ includeArchived: true });
    setSubjects(res?.subjects || []);
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [profileRes, subjectsRes, tasksRes] = await Promise.all([
          fetchMyStudentProfile(),
          fetchSubjects({ includeArchived: true }),
          fetchTasks({ limit: 500 }),
        ]);
        if (!mounted) return;
        const p = profileRes?.profile || {};
        setProfileData(p);
        const nestedPrefs =
          p.study_preferences && typeof p.study_preferences === "object" ? p.study_preferences : {};
        const semesterStart =
          // Top-level column wins if present (future Phase 3 schema);
          // else read from nested study_preferences (current Phase 2 location).
          p.semester_start_date || nestedPrefs.semester_start_date || "";
        setForm({
          display_name: p.display_name || "",
          grade_level: p.grade_level || "",
          school: p.school || "",
          major: p.major || "",
          year_level: p.year_level || "",
          timezone: p.timezone || "America/New_York",
          weekly_goal_hours: p.weekly_goal_hours || 10,
          study_preferences:
            typeof p.study_preferences === "string"
              ? p.study_preferences
              : p.study_preferences
              ? JSON.stringify(p.study_preferences)
              : "",
          semester_start_date: semesterStart,
        });
        setSubjects(subjectsRes?.subjects || []);
        setTasks(tasksRes?.tasks || []);
      } catch {
        // profile may not exist yet
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // derived data
  const taskCountBySubject = useMemo(() => {
    const counts = {};
    for (const t of tasks) {
      if (t.subject_id) counts[t.subject_id] = (counts[t.subject_id] || 0) + 1;
    }
    return counts;
  }, [tasks]);

  const activeSubjects = subjects.filter((s) => !s.archived);
  const archivedSubjects = subjects.filter((s) => s.archived);

  // ── Handlers ─────────────────────────────────────────────────────────

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        display_name: form.display_name.trim() || undefined,
        grade_level: form.grade_level.trim() || undefined,
        school: form.school.trim() || undefined,
        major: form.major.trim() || undefined,
        year_level: form.year_level || undefined,
        timezone: form.timezone || undefined,
        weekly_goal_hours: Number(form.weekly_goal_hours) || 10,
      };

      // Build study_preferences as a merge of:
      //   1. existing nested object from the loaded profile (so onboarding-set
      //      fields like `subjects` survive if the user didn't edit them)
      //   2. whatever the user typed into the textarea (parsed JSON or notes)
      //   3. the dedicated semester_start_date form field
      // The backend PUT does a full-replace on study_preferences, so we MUST
      // include any fields we want to preserve.
      const existingPrefs =
        profileData?.study_preferences && typeof profileData.study_preferences === "object"
          ? profileData.study_preferences
          : {};
      const studyPrefs = { ...existingPrefs };

      if (form.study_preferences.trim()) {
        try {
          const parsed = JSON.parse(form.study_preferences);
          if (parsed && typeof parsed === "object") {
            Object.assign(studyPrefs, parsed);
          } else {
            studyPrefs.notes = form.study_preferences.trim();
          }
        } catch {
          studyPrefs.notes = form.study_preferences.trim();
        }
      }

      if (form.semester_start_date) {
        studyPrefs.semester_start_date = form.semester_start_date;
      }

      if (Object.keys(studyPrefs).length > 0) {
        payload.study_preferences = studyPrefs;
      }

      await persistMyStudentProfile(payload);
      toast.success("Profile saved");
    } catch (err) {
      toast.error("Failed to save profile", { description: err?.message });
    } finally {
      setSaving(false);
    }
  };

  const restartOnboarding = async () => {
    setResetting(true);
    try {
      await persistMyStudentProfile({ onboarding_completed: false });
      setOnboardingComplete(false);
      toast.info("Onboarding reset");
      navigate("/app/onboarding");
    } catch (err) {
      toast.error("Could not reset onboarding", { description: err?.message });
    } finally {
      setResetting(false);
    }
  };

  const handleAddSubject = async () => {
    if (!newSubject.trim()) return;
    setAddingSubject(true);
    try {
      await createSubject({ name: newSubject.trim(), color: newSubjectColor });
      setNewSubject("");
      await reloadSubjects();
      toast.success("Subject added");
    } catch (err) {
      toast.error("Failed to add subject", { description: err?.message });
    } finally {
      setAddingSubject(false);
    }
  };

  const handleRename = async (subjectId, newName) => {
    // Optimistic update
    setSubjects((prev) =>
      prev.map((s) => (s.id === subjectId ? { ...s, name: newName } : s))
    );
    try {
      await patchSubject(subjectId, { name: newName });
    } catch (err) {
      toast.error("Failed to rename subject", { description: err?.message });
      await reloadSubjects();
    }
  };

  const handleRecolor = async (subjectId, color) => {
    // Optimistic update
    setSubjects((prev) =>
      prev.map((s) => (s.id === subjectId ? { ...s, color } : s))
    );
    try {
      await patchSubject(subjectId, { color });
    } catch (err) {
      toast.error("Failed to update color", { description: err?.message });
      await reloadSubjects();
    }
  };

  const handleArchiveConfirm = async () => {
    if (!archiveTarget) return;
    setArchivingSubject(true);
    try {
      await patchSubject(archiveTarget.id, { archived: true });
      setArchiveTarget(null);
      await reloadSubjects();
      toast.success(`"${archiveTarget.name}" archived`);
    } catch (err) {
      toast.error("Failed to archive subject", { description: err?.message });
    } finally {
      setArchivingSubject(false);
    }
  };

  const handleRestore = async (subjectId) => {
    const s = subjects.find((sub) => sub.id === subjectId);
    try {
      await patchSubject(subjectId, { archived: false });
      await reloadSubjects();
      toast.success(`"${s?.name}" restored`);
    } catch (err) {
      toast.error("Failed to restore subject", { description: err?.message });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage your profile and study preferences.
        </p>
      </div>

      {/* Profile Card */}
      <Card className="border-border/40 bg-card/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <User className="h-4 w-4 text-accent" />
            Student Profile
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="display_name">Display Name</Label>
              <Input
                id="display_name"
                value={form.display_name}
                onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))}
                placeholder="Your name"
                className="mt-1"
                maxLength={120}
              />
            </div>
            <div>
              <Label htmlFor="grade_level">Grade Level</Label>
              <Input
                id="grade_level"
                value={form.grade_level}
                onChange={(e) => setForm((f) => ({ ...f, grade_level: e.target.value }))}
                placeholder="e.g. 11th Grade, Undergraduate"
                className="mt-1"
                maxLength={160}
              />
            </div>
            <div>
              <Label htmlFor="school">School</Label>
              <Input
                id="school"
                value={form.school}
                onChange={(e) => setForm((f) => ({ ...f, school: e.target.value }))}
                placeholder="Your school name"
                className="mt-1"
                maxLength={160}
              />
            </div>
            <div>
              <Label htmlFor="major">Major / Focus Area</Label>
              <Input
                id="major"
                value={form.major}
                onChange={(e) => setForm((f) => ({ ...f, major: e.target.value }))}
                placeholder="e.g. Nursing, Computer Science"
                className="mt-1"
                maxLength={160}
              />
            </div>
            <div>
              <Label htmlFor="year_level">Year Level</Label>
              <Select
                value={form.year_level}
                onValueChange={(v) => setForm((f) => ({ ...f, year_level: v }))}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select year" />
                </SelectTrigger>
                <SelectContent>
                  {YEAR_LEVELS.map((y) => (
                    <SelectItem key={y.value} value={y.value}>
                      {y.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="timezone">Timezone</Label>
              <Select
                value={form.timezone}
                onValueChange={(v) => setForm((f) => ({ ...f, timezone: v }))}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIMEZONES.map((tz) => (
                    <SelectItem key={tz} value={tz}>
                      {tz.replace(/_/g, " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="weekly_goal">Weekly Study Goal (hours)</Label>
              <Input
                id="weekly_goal"
                type="number"
                min={1}
                max={168}
                value={form.weekly_goal_hours}
                onChange={(e) =>
                  setForm((f) => ({ ...f, weekly_goal_hours: e.target.value }))
                }
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="semester_start_date">Semester Start Date</Label>
              <Input
                id="semester_start_date"
                type="date"
                value={form.semester_start_date}
                onChange={(e) =>
                  setForm((f) => ({ ...f, semester_start_date: e.target.value }))
                }
                className="mt-1"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Anchors your Truth-Line on the Dashboard.
              </p>
            </div>
          </div>

          <div>
            <Label htmlFor="study_prefs">Study Preferences / Notes</Label>
            <Textarea
              id="study_prefs"
              value={form.study_preferences}
              onChange={(e) =>
                setForm((f) => ({ ...f, study_preferences: e.target.value }))
              }
              placeholder="Any study preferences or notes..."
              className="mt-1"
              rows={3}
            />
          </div>

          <div className="flex gap-2">
            <Button
              className="bg-accent text-accent-foreground hover:bg-accent/90"
              disabled={saving}
              onClick={handleSave}
            >
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Save Profile
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Subjects Card */}
      <Card className="border-border/40 bg-card/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Settings className="h-4 w-4 text-accent" />
            Subjects
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Active subjects list */}
          {activeSubjects.length > 0 ? (
            <div className="space-y-1.5">
              {activeSubjects.map((s) => (
                <div key={s.id} className="relative">
                  <SubjectRow
                    subject={s}
                    taskCount={taskCountBySubject[s.id] || 0}
                    onRename={handleRename}
                    onRecolor={handleRecolor}
                    onArchive={setArchiveTarget}
                    onRestore={handleRestore}
                  />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No subjects yet. Add your first one below.
            </p>
          )}

          {/* Add new subject */}
          <div className="flex gap-2 pt-1">
            <Input
              value={newSubject}
              onChange={(e) => setNewSubject(e.target.value)}
              placeholder="e.g. Biology 101"
              className="max-w-xs"
              onKeyDown={(e) => e.key === "Enter" && handleAddSubject()}
            />
            {/* Color picker row */}
            <div className="flex items-center gap-1">
              {SUBJECT_COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  title={c.label}
                  onClick={() => setNewSubjectColor(c.value)}
                  className={`h-5 w-5 rounded-full border-2 transition-transform hover:scale-110 ${
                    newSubjectColor === c.value
                      ? "border-foreground scale-110"
                      : "border-transparent"
                  }`}
                  style={{ backgroundColor: c.value }}
                />
              ))}
            </div>
            <Button
              variant="outline"
              className="border-border/50"
              disabled={addingSubject || !newSubject.trim()}
              onClick={handleAddSubject}
            >
              {addingSubject ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Add"
              )}
            </Button>
          </div>

          {/* Archived subjects collapsible */}
          {archivedSubjects.length > 0 && (
            <Collapsible open={archivedOpen} onOpenChange={setArchivedOpen}>
              <CollapsibleTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 text-xs text-muted-foreground hover:text-foreground"
                  data-testid="archived-toggle"
                >
                  {archivedOpen ? (
                    <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ChevronRight className="h-3 w-3" />
                  )}
                  {archivedSubjects.length} archived
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-1.5 pt-1">
                {archivedSubjects.map((s) => (
                  <SubjectRow
                    key={s.id}
                    subject={s}
                    taskCount={taskCountBySubject[s.id] || 0}
                    onRename={handleRename}
                    onRecolor={handleRecolor}
                    onArchive={setArchiveTarget}
                    onRestore={handleRestore}
                  />
                ))}
              </CollapsibleContent>
            </Collapsible>
          )}
        </CardContent>
      </Card>

      {/* Account Card */}
      <Card className="border-border/40 bg-card/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <RotateCcw className="h-4 w-4 text-accent" />
            Account
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            className="border-border/50"
            onClick={restartOnboarding}
            disabled={resetting}
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            {resetting ? "Resetting..." : "Restart Onboarding"}
          </Button>
          <p className="mt-2 text-xs text-muted-foreground">
            This will reset your onboarding flow so you can update your initial
            profile setup.
          </p>
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="border-red-500/30 bg-red-500/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-red-300">
            <ShieldAlert className="h-4 w-4" />
            Danger Zone
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            className="border-red-500/40 text-red-300 hover:bg-red-500/10 hover:text-red-200"
            onClick={() => {
              setDeleteConfirmText("");
              setDeleteOpen(true);
            }}
          >
            Delete my account and data
          </Button>
          <p className="mt-2 text-xs text-muted-foreground">
            Permanently deletes your tasks, notes, planner, focus history, and
            AI conversations, and cancels any active subscription. This cannot
            be undone. Your sign-in identity is removed separately — see the
            Privacy Policy.
          </p>
        </CardContent>
      </Card>

      {/* Delete account confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={(open) => !open && setDeleteOpen(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete your account?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently erases all of your data and cancels active
              subscriptions. Type <span className="font-semibold text-foreground">delete my account</span> to
              confirm.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={deleteConfirmText}
            onChange={(e) => setDeleteConfirmText(e.target.value)}
            placeholder="delete my account"
            aria-label="Type delete my account to confirm"
          />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-500"
              disabled={deleting || deleteConfirmText.trim().toLowerCase() !== "delete my account"}
              onClick={(e) => {
                e.preventDefault();
                handleDeleteAccount();
              }}
            >
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete everything
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Archive confirmation dialog */}
      <AlertDialog
        open={!!archiveTarget}
        onOpenChange={(open) => !open && setArchiveTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive Subject</AlertDialogTitle>
            <AlertDialogDescription>
              Archive &ldquo;{archiveTarget?.name}&rdquo;? It will be hidden from the
              subject picker but can be restored here at any time. Tasks linked to this
              subject keep their data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleArchiveConfirm}
              disabled={archivingSubject}
              className="bg-amber-500 hover:bg-amber-600 text-white"
            >
              {archivingSubject && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Archive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
