import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, RotateCcw, Save, Settings, User, Trash2, Plus, X } from "lucide-react";
import { toast } from "sonner";

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
  fetchMyStudentProfile,
  persistMyStudentProfile,
  setOnboardingComplete,
} from "@/lib/onboarding";
import { fetchSubjects, createSubject, deleteSubject } from "@/lib/tasksApi";

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

export default function UserSettings() {
  const navigate = useNavigate();

  // profile state
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [form, setForm] = useState({
    display_name: "",
    grade_level: "",
    school: "",
    major: "",
    year_level: "",
    timezone: "America/New_York",
    weekly_goal_hours: 10,
    study_preferences: "",
  });

  // subjects state
  const [subjects, setSubjects] = useState([]);
  const [newSubject, setNewSubject] = useState("");
  const [addingSubject, setAddingSubject] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deletingSubject, setDeletingSubject] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [profileRes, subjectsRes] = await Promise.all([
          fetchMyStudentProfile(),
          fetchSubjects(),
        ]);
        if (!mounted) return;
        const p = profileRes?.profile || {};
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
        });
        setSubjects(subjectsRes?.subjects || []);
      } catch {
        // profile may not exist yet
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

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
      if (form.study_preferences.trim()) {
        try {
          payload.study_preferences = JSON.parse(form.study_preferences);
        } catch {
          payload.study_preferences = { notes: form.study_preferences.trim() };
        }
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
      await createSubject({ name: newSubject.trim() });
      setNewSubject("");
      const res = await fetchSubjects();
      setSubjects(res?.subjects || []);
      toast.success("Subject added");
    } catch (err) {
      toast.error("Failed to add subject", { description: err?.message });
    } finally {
      setAddingSubject(false);
    }
  };

  const handleDeleteSubject = async () => {
    if (!deleteTarget) return;
    setDeletingSubject(true);
    try {
      await deleteSubject(deleteTarget.id);
      setDeleteTarget(null);
      const res = await fetchSubjects();
      setSubjects(res?.subjects || []);
      toast.success("Subject deleted");
    } catch (err) {
      toast.error("Failed to delete subject", { description: err?.message });
    } finally {
      setDeletingSubject(false);
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
        <p className="text-sm text-muted-foreground">Manage your profile and study preferences.</p>
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
                onChange={(e) => setForm((f) => ({ ...f, weekly_goal_hours: e.target.value }))}
                className="mt-1"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="study_prefs">Study Preferences / Notes</Label>
            <Textarea
              id="study_prefs"
              value={form.study_preferences}
              onChange={(e) => setForm((f) => ({ ...f, study_preferences: e.target.value }))}
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
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
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
            Manage Subjects
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {subjects.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {subjects.map((s) => (
                <Badge
                  key={s.id}
                  variant="secondary"
                  className="gap-1 px-2.5 py-1 text-sm"
                >
                  {s.name}
                  <button
                    onClick={() => setDeleteTarget(s)}
                    className="ml-1 rounded-full p-0.5 hover:bg-destructive/20 hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No subjects yet. Add your first one below.</p>
          )}

          <div className="flex gap-2">
            <Input
              value={newSubject}
              onChange={(e) => setNewSubject(e.target.value)}
              placeholder="e.g. Biology 101"
              className="max-w-xs"
              onKeyDown={(e) => e.key === "Enter" && handleAddSubject()}
            />
            <Button
              variant="outline"
              className="border-border/50"
              disabled={addingSubject || !newSubject.trim()}
              onClick={handleAddSubject}
            >
              {addingSubject ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              Add
            </Button>
          </div>
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
          <Button variant="outline" className="border-border/50" onClick={restartOnboarding} disabled={resetting}>
            <RotateCcw className="mr-2 h-4 w-4" />
            {resetting ? "Resetting..." : "Restart Onboarding"}
          </Button>
          <p className="mt-2 text-xs text-muted-foreground">
            This will reset your onboarding flow so you can update your initial profile setup.
          </p>
        </CardContent>
      </Card>

      {/* Delete Subject Confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Subject</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{deleteTarget?.name}&quot;? Tasks linked to this subject will keep their data but lose the subject tag.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" disabled={deletingSubject} onClick={handleDeleteSubject}>
              {deletingSubject && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
