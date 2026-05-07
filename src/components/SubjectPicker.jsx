import { useState } from "react";
import { Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const SUBJECT_COLORS = [
  { value: "#64748b", label: "Slate" },
  { value: "#3b82f6", label: "Blue" },
  { value: "#10b981", label: "Emerald" },
  { value: "#f59e0b", label: "Amber" },
  { value: "#ef4444", label: "Red" },
  { value: "#8b5cf6", label: "Violet" },
  { value: "#ec4899", label: "Pink" },
  { value: "#f97316", label: "Orange" },
];

function ColorSwatch({ color, selected, onClick }) {
  return (
    <button
      type="button"
      title={color.label}
      onClick={() => onClick(color.value)}
      data-testid={`color-swatch-${color.label.toLowerCase()}`}
      className={`h-6 w-6 rounded-full border-2 transition-transform ${
        selected ? "border-foreground scale-110" : "border-transparent hover:scale-105"
      }`}
      style={{ backgroundColor: color.value }}
    />
  );
}

export function SubjectPicker({ value, onChange, subjects = [], onCreate }) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(SUBJECT_COLORS[1].value);
  const [creating, setCreating] = useState(false);

  const activeSubjects = subjects.filter((s) => !s.archived);
  const selected = activeSubjects.find((s) => s.id === value);

  const handleCreate = async () => {
    if (!newName.trim() || creating) return;
    setCreating(true);
    try {
      await onCreate(newName.trim(), newColor);
      setNewName("");
      setNewColor(SUBJECT_COLORS[1].value);
      setPopoverOpen(false);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="flex gap-2">
      <Select value={value || ""} onValueChange={(v) => onChange(v || null)}>
        <SelectTrigger className="flex-1 mt-1" data-testid="subject-select-trigger">
          <SelectValue placeholder="No subject">
            {selected && (
              <span className="flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: selected.color || "#64748b" }}
                />
                {selected.name}
              </span>
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">None</SelectItem>
          {activeSubjects.map((s) => (
            <SelectItem key={s.id} value={s.id}>
              <span className="flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: s.color || "#64748b" }}
                />
                {s.name}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="mt-1 h-10 w-10 flex-shrink-0"
            data-testid="subject-create-trigger"
            title="Add new subject"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-3" align="end">
          <p className="mb-2 text-sm font-medium">New Subject</p>
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. Biology 101"
            className="mb-2"
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            autoFocus
            data-testid="subject-name-input"
          />
          <div className="mb-3 grid grid-cols-8 gap-1">
            {SUBJECT_COLORS.map((c) => (
              <ColorSwatch
                key={c.value}
                color={c}
                selected={newColor === c.value}
                onClick={setNewColor}
              />
            ))}
          </div>
          <Button
            type="button"
            className="h-8 w-full text-sm bg-accent text-accent-foreground hover:bg-accent/90"
            disabled={!newName.trim() || creating}
            onClick={handleCreate}
            data-testid="subject-create-submit"
          >
            {creating && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
            Add Subject
          </Button>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export default SubjectPicker;
