import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Archive,
  ArchiveRestore,
  Layers,
  Loader2,
  Plus,
  RotateCcw,
  Search,
  StickyNote,
  Tag,
  Trash2,
  WandSparkles,
} from "lucide-react";
import { toast } from "sonner";

import { track } from "@/lib/analytics";

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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import SubjectPicker from "@/components/SubjectPicker";

import {
  fetchNotes,
  createNote,
  updateNote,
  deleteNote,
  fetchCards,
  createCard,
  reviewCard,
  deleteCard,
} from "@/lib/notesApi";
import { fetchSubjects, createSubject } from "@/lib/tasksApi";

const EMPTY_NOTE_FORM = { title: "", content: "", tags: "", subject_id: "" };
const EMPTY_CARD_FORM = { front_text: "", back_text: "", note_id: "" };

const RATING_BUTTONS = [
  { rating: "again", label: "Again", className: "bg-red-500/20 text-red-300 hover:bg-red-500/30" },
  { rating: "hard", label: "Hard", className: "bg-amber-500/20 text-amber-300 hover:bg-amber-500/30" },
  { rating: "good", label: "Good", className: "bg-blue-500/20 text-blue-300 hover:bg-blue-500/30" },
  { rating: "easy", label: "Easy", className: "bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30" },
];

function parseTagsInput(value) {
  return value
    .split(",")
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean);
}

export default function NotesPad() {
  // notes state
  const [notes, setNotes] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [activeTag, setActiveTag] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  // cards state
  const [cards, setCards] = useState([]);
  const [dueCards, setDueCards] = useState([]);
  const [cardsLoading, setCardsLoading] = useState(true);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [reviewSaving, setReviewSaving] = useState(false);

  // dialogs
  const [showNoteDialog, setShowNoteDialog] = useState(false);
  const [editNote, setEditNote] = useState(null);
  const [noteForm, setNoteForm] = useState(EMPTY_NOTE_FORM);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [showCardDialog, setShowCardDialog] = useState(false);
  const [cardForm, setCardForm] = useState(EMPTY_CARD_FORM);
  const [saving, setSaving] = useState(false);

  // ── Data loading ─────────────────────────────────────────────────────

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(handle);
  }, [query]);

  const loadNotes = useCallback(async () => {
    setLoading(true);
    try {
      const [notesRes, subjectsRes] = await Promise.all([
        fetchNotes({
          q: debouncedQuery || undefined,
          tag: activeTag || undefined,
          includeArchived: showArchived,
        }),
        fetchSubjects().catch(() => ({ subjects: [] })),
      ]);
      setNotes(notesRes.notes || []);
      setSubjects(subjectsRes.subjects || []);
    } catch (err) {
      toast.error("Could not load notes", { description: err.message });
    } finally {
      setLoading(false);
    }
  }, [debouncedQuery, activeTag, showArchived]);

  const loadCards = useCallback(async () => {
    setCardsLoading(true);
    try {
      const [allRes, dueRes] = await Promise.all([
        fetchCards(),
        fetchCards({ dueOnly: true }),
      ]);
      setCards(allRes.cards || []);
      setDueCards(dueRes.cards || []);
      setReviewIndex(0);
      setShowAnswer(false);
    } catch (err) {
      toast.error("Could not load review cards", { description: err.message });
    } finally {
      setCardsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  useEffect(() => {
    loadCards();
  }, [loadCards]);

  // ── Note handlers ────────────────────────────────────────────────────

  const openCreateNote = () => {
    setNoteForm(EMPTY_NOTE_FORM);
    setEditNote(null);
    setShowNoteDialog(true);
  };

  const openEditNote = (note) => {
    setNoteForm({
      title: note.title || "",
      content: note.content || "",
      tags: (note.tags || []).join(", "),
      subject_id: note.subject_id || "",
    });
    setEditNote(note);
    setShowNoteDialog(true);
  };

  const handleSaveNote = async () => {
    if (!noteForm.title.trim()) return;
    setSaving(true);
    try {
      const payload = {
        title: noteForm.title.trim(),
        content: noteForm.content,
        tags: parseTagsInput(noteForm.tags),
      };
      if (noteForm.subject_id) payload.subject_id = noteForm.subject_id;

      if (editNote) {
        await updateNote(editNote.id, payload);
        toast.success("Note updated");
      } else {
        await createNote(payload);
        track("note_create", { tag_count: payload.tags.length });
        toast.success("Note created");
      }
      setShowNoteDialog(false);
      setEditNote(null);
      setNoteForm(EMPTY_NOTE_FORM);
      await loadNotes();
    } catch (err) {
      toast.error("Could not save note", { description: err.message });
    } finally {
      setSaving(false);
    }
  };

  const handleArchiveToggle = async (note) => {
    try {
      await updateNote(note.id, { is_archived: !note.is_archived });
      toast.success(note.is_archived ? "Note restored" : "Note archived");
      await loadNotes();
    } catch (err) {
      toast.error("Could not update note", { description: err.message });
    }
  };

  const handleDeleteNote = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      await deleteNote(deleteTarget.id);
      toast.success("Note deleted");
      setDeleteTarget(null);
      await loadNotes();
    } catch (err) {
      toast.error("Could not delete note", { description: err.message });
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

  const openCardFromNote = (note) => {
    setCardForm({
      front_text: note.title || "",
      back_text: (note.content || "").slice(0, 2000),
      note_id: note.id,
    });
    setShowNoteDialog(false);
    setShowCardDialog(true);
  };

  // ── Card handlers ────────────────────────────────────────────────────

  const handleSaveCard = async () => {
    if (!cardForm.front_text.trim() || !cardForm.back_text.trim()) return;
    setSaving(true);
    try {
      const payload = {
        front_text: cardForm.front_text.trim(),
        back_text: cardForm.back_text.trim(),
      };
      if (cardForm.note_id) payload.note_id = cardForm.note_id;
      await createCard(payload);
      toast.success("Review card created");
      setShowCardDialog(false);
      setCardForm(EMPTY_CARD_FORM);
      await loadCards();
    } catch (err) {
      toast.error("Could not create card", { description: err.message });
    } finally {
      setSaving(false);
    }
  };

  const handleReview = async (rating) => {
    const card = dueCards[reviewIndex];
    if (!card || reviewSaving) return;
    setReviewSaving(true);
    try {
      await reviewCard(card.id, rating);
      track("card_review", { rating });
      if (reviewIndex >= dueCards.length - 1) {
        toast.success("Review session complete!");
        await loadCards();
      } else {
        setReviewIndex((i) => i + 1);
        setShowAnswer(false);
      }
    } catch (err) {
      toast.error("Could not record review", { description: err.message });
    } finally {
      setReviewSaving(false);
    }
  };

  const handleDeleteCard = async (card) => {
    try {
      await deleteCard(card.id);
      toast.success("Card deleted");
      await loadCards();
    } catch (err) {
      toast.error("Could not delete card", { description: err.message });
    }
  };

  // ── Derived data ─────────────────────────────────────────────────────

  const allTags = useMemo(() => {
    const tags = new Set();
    for (const note of notes) {
      for (const tag of note.tags || []) tags.add(tag);
    }
    return Array.from(tags).sort();
  }, [notes]);

  const subjectMap = useMemo(() => {
    const map = {};
    for (const s of subjects) map[s.id] = s;
    return map;
  }, [subjects]);

  const currentReviewCard = dueCards[reviewIndex];

  // ── Render ───────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Notes Pad</h1>
          <p className="text-sm text-muted-foreground">
            Subject-linked notes with tags, search, and review cards.
          </p>
        </div>
      </div>

      <Tabs defaultValue="notes">
        <TabsList className="bg-card/60">
          <TabsTrigger value="notes" className="gap-2">
            <StickyNote className="h-4 w-4" /> Notes
          </TabsTrigger>
          <TabsTrigger value="cards" className="gap-2">
            <Layers className="h-4 w-4" /> Review Cards
            {dueCards.length > 0 && (
              <Badge className="ml-1 bg-accent text-accent-foreground">{dueCards.length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ── Notes tab ─────────────────────────────────────────────── */}
        <TabsContent value="notes" className="space-y-3 pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search notes by title or content"
                className="pl-9"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <Button
              variant="outline"
              className="border-border/50"
              onClick={() => setShowArchived((v) => !v)}
            >
              <Archive className="mr-2 h-4 w-4" />
              {showArchived ? "Hide Archived" : "Show Archived"}
            </Button>
            <Button
              className="bg-accent text-accent-foreground hover:bg-accent/90"
              onClick={openCreateNote}
            >
              <Plus className="mr-2 h-4 w-4" />
              New Note
            </Button>
          </div>

          {allTags.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <Tag className="h-3.5 w-3.5 text-muted-foreground" />
              {allTags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setActiveTag(activeTag === tag ? "" : tag)}
                  className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
                    activeTag === tag
                      ? "border-accent bg-accent/20 text-accent"
                      : "border-border/50 text-muted-foreground hover:bg-card/60"
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-accent" />
            </div>
          ) : notes.length === 0 ? (
            <Card className="border-dashed border-border/30 bg-card/30">
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                {debouncedQuery || activeTag
                  ? "No notes match your search."
                  : "No notes yet. Capture your first one with New Note."}
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {notes.map((note) => {
                const subject = subjectMap[note.subject_id];
                return (
                  <Card
                    key={note.id}
                    className={`cursor-pointer border transition-colors hover:bg-card/80 ${
                      note.is_archived
                        ? "border-border/20 bg-card/20 opacity-70"
                        : "border-border/40 bg-card/50"
                    }`}
                    onClick={() => openEditNote(note)}
                  >
                    <CardContent className="space-y-2 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium leading-tight text-foreground">
                          {note.title}
                        </p>
                        {note.is_archived && (
                          <Badge variant="outline" className="shrink-0 text-[10px]">
                            archived
                          </Badge>
                        )}
                      </div>
                      {note.content && (
                        <p className="line-clamp-3 whitespace-pre-line text-xs text-muted-foreground">
                          {note.content}
                        </p>
                      )}
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                        {subject && <span className="truncate">{subject.name}</span>}
                        {(note.tags || []).map((tag) => (
                          <Badge key={tag} variant="secondary" className="h-4 px-1.5 text-[10px]">
                            {tag}
                          </Badge>
                        ))}
                        <span className="ml-auto">
                          {note.updated_at && new Date(note.updated_at).toLocaleDateString()}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 pt-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 gap-1 px-2 text-[11px] text-accent"
                          onClick={(e) => {
                            e.stopPropagation();
                            openCardFromNote(note);
                          }}
                        >
                          <WandSparkles className="h-3 w-3" />
                          Make card
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-[11px]"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleArchiveToggle(note);
                          }}
                        >
                          {note.is_archived ? (
                            <ArchiveRestore className="h-3 w-3" />
                          ) : (
                            <Archive className="h-3 w-3" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="ml-auto h-6 px-2 text-red-400 hover:text-red-300"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteTarget(note);
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
          )}
        </TabsContent>

        {/* ── Review cards tab ──────────────────────────────────────── */}
        <TabsContent value="cards" className="space-y-3 pt-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              {dueCards.length > 0
                ? `${dueCards.length} card${dueCards.length !== 1 ? "s" : ""} due for review`
                : "All caught up — no cards due."}
            </p>
            <Button
              className="bg-accent text-accent-foreground hover:bg-accent/90"
              onClick={() => {
                setCardForm(EMPTY_CARD_FORM);
                setShowCardDialog(true);
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              New Card
            </Button>
          </div>

          {cardsLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-accent" />
            </div>
          ) : (
            <>
              {currentReviewCard && (
                <Card className="border-accent/30 bg-card/60">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center justify-between text-sm text-muted-foreground">
                      <span className="flex items-center gap-2">
                        <RotateCcw className="h-4 w-4 text-accent" />
                        Review {reviewIndex + 1} of {dueCards.length}
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="min-h-[48px] text-base font-medium text-foreground">
                      {currentReviewCard.front_text}
                    </p>
                    {showAnswer ? (
                      <>
                        <div className="rounded-md border border-border/40 bg-background/40 p-3 text-sm text-foreground whitespace-pre-line">
                          {currentReviewCard.back_text}
                        </div>
                        <div className="grid grid-cols-4 gap-2">
                          {RATING_BUTTONS.map(({ rating, label, className }) => (
                            <Button
                              key={rating}
                              disabled={reviewSaving}
                              className={className}
                              onClick={() => handleReview(rating)}
                            >
                              {label}
                            </Button>
                          ))}
                        </div>
                      </>
                    ) : (
                      <Button
                        variant="outline"
                        className="w-full border-border/50"
                        onClick={() => setShowAnswer(true)}
                      >
                        Show Answer
                      </Button>
                    )}
                  </CardContent>
                </Card>
              )}

              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  All cards ({cards.length})
                </p>
                {cards.length === 0 ? (
                  <Card className="border-dashed border-border/30 bg-card/30">
                    <CardContent className="py-8 text-center text-sm text-muted-foreground">
                      No review cards yet. Create one or use "Make card" on a note.
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid gap-2 md:grid-cols-2">
                    {cards.map((card) => (
                      <Card key={card.id} className="border-border/40 bg-card/50">
                        <CardContent className="space-y-1 p-3">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-medium text-foreground">{card.front_text}</p>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 shrink-0 px-2 text-red-400 hover:text-red-300"
                              onClick={() => handleDeleteCard(card)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                          <p className="line-clamp-2 text-xs text-muted-foreground">{card.back_text}</p>
                          <p className="text-[11px] text-muted-foreground">
                            Reviewed {card.review_count || 0} time{(card.review_count || 0) !== 1 ? "s" : ""}
                            {card.next_review_at &&
                              ` · next ${new Date(card.next_review_at).toLocaleDateString()}`}
                          </p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* ── Note dialog ───────────────────────────────────────────────── */}
      <Dialog
        open={showNoteDialog}
        onOpenChange={(open) => {
          if (!open) {
            setShowNoteDialog(false);
            setEditNote(null);
            setNoteForm(EMPTY_NOTE_FORM);
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editNote ? "Edit Note" : "New Note"}</DialogTitle>
            <DialogDescription>
              {editNote
                ? "Update your note below."
                : "Capture what you're learning — tags make it searchable later."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <Label htmlFor="note-title">Title *</Label>
              <Input
                id="note-title"
                value={noteForm.title}
                onChange={(e) => setNoteForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Photosynthesis overview"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="note-content">Content</Label>
              <Textarea
                id="note-content"
                value={noteForm.content}
                onChange={(e) => setNoteForm((f) => ({ ...f, content: e.target.value }))}
                placeholder="Write your note..."
                className="mt-1"
                rows={6}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="note-tags">Tags</Label>
                <Input
                  id="note-tags"
                  value={noteForm.tags}
                  onChange={(e) => setNoteForm((f) => ({ ...f, tags: e.target.value }))}
                  placeholder="comma, separated"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Subject</Label>
                <SubjectPicker
                  value={noteForm.subject_id || null}
                  onChange={(v) => setNoteForm((f) => ({ ...f, subject_id: v || "" }))}
                  subjects={subjects}
                  onCreate={handleCreateSubject}
                />
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            {editNote ? (
              <Button
                variant="outline"
                className="border-border/50"
                onClick={() => openCardFromNote(editNote)}
              >
                <WandSparkles className="mr-2 h-4 w-4" />
                Make card
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowNoteDialog(false);
                  setEditNote(null);
                  setNoteForm(EMPTY_NOTE_FORM);
                }}
              >
                Cancel
              </Button>
              <Button
                className="bg-accent text-accent-foreground hover:bg-accent/90"
                disabled={saving || !noteForm.title.trim()}
                onClick={handleSaveNote}
              >
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editNote ? "Save Changes" : "Create Note"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Card dialog ───────────────────────────────────────────────── */}
      <Dialog
        open={showCardDialog}
        onOpenChange={(open) => {
          if (!open) {
            setShowCardDialog(false);
            setCardForm(EMPTY_CARD_FORM);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New Review Card</DialogTitle>
            <DialogDescription>
              Front shows first — flip to check the back during review.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <Label htmlFor="card-front">Front (question) *</Label>
              <Textarea
                id="card-front"
                value={cardForm.front_text}
                onChange={(e) => setCardForm((f) => ({ ...f, front_text: e.target.value }))}
                placeholder="e.g. What does the mitochondria do?"
                className="mt-1"
                rows={2}
              />
            </div>
            <div>
              <Label htmlFor="card-back">Back (answer) *</Label>
              <Textarea
                id="card-back"
                value={cardForm.back_text}
                onChange={(e) => setCardForm((f) => ({ ...f, back_text: e.target.value }))}
                placeholder="The answer..."
                className="mt-1"
                rows={4}
              />
            </div>
            {notes.length > 0 && (
              <div>
                <Label>Linked note (optional)</Label>
                <Select
                  value={cardForm.note_id || "none"}
                  onValueChange={(v) =>
                    setCardForm((f) => ({ ...f, note_id: v === "none" ? "" : v }))
                  }
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {notes.map((note) => (
                      <SelectItem key={note.id} value={note.id}>
                        {note.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowCardDialog(false);
                setCardForm(EMPTY_CARD_FORM);
              }}
            >
              Cancel
            </Button>
            <Button
              className="bg-accent text-accent-foreground hover:bg-accent/90"
              disabled={saving || !cardForm.front_text.trim() || !cardForm.back_text.trim()}
              onClick={handleSaveCard}
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Card
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete note confirmation ──────────────────────────────────── */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Note</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{deleteTarget?.title}"? Linked review cards
              will also be removed. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={saving} onClick={handleDeleteNote}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
