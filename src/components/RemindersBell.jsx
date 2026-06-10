import { useCallback, useEffect, useState } from "react";
import { AlertCircle, Bell, CalendarClock, CheckCheck, Clock, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  fetchReminders,
  syncReminders,
  markReminderRead,
  markAllRemindersRead,
} from "@/lib/remindersApi";

const TYPE_ICONS = {
  due_soon: Clock,
  overdue: AlertCircle,
  study_block: CalendarClock,
  weekly_reset: RotateCcw,
};

const TYPE_ACCENTS = {
  due_soon: "text-amber-400",
  overdue: "text-red-400",
  study_block: "text-accent",
  weekly_reset: "text-blue-400",
};

function timeAgo(iso) {
  if (!iso) return "";
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export default function RemindersBell() {
  const [reminders, setReminders] = useState([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);

  const refresh = useCallback(async ({ sync = false } = {}) => {
    try {
      if (sync) await syncReminders().catch(() => null);
      const res = await fetchReminders({ limit: 15 });
      setReminders(res.reminders || []);
      setUnread(res.unread || 0);
    } catch {
      // Bell is best-effort chrome: a failed fetch should never break the shell.
    }
  }, []);

  useEffect(() => {
    refresh({ sync: true });
  }, [refresh]);

  const handleOpenChange = (next) => {
    setOpen(next);
    if (next) refresh({ sync: true });
  };

  const handleMarkRead = async (reminder) => {
    if (reminder.is_read) return;
    try {
      await markReminderRead(reminder.id);
      setReminders((items) =>
        items.map((item) => (item.id === reminder.id ? { ...item, is_read: true } : item))
      );
      setUnread((count) => Math.max(0, count - 1));
    } catch {
      // ignore — next refresh self-heals
    }
  };

  const handleMarkAll = async () => {
    try {
      await markAllRemindersRead();
      setReminders((items) => items.map((item) => ({ ...item, is_read: true })));
      setUnread(0);
    } catch {
      // ignore — next refresh self-heals
    }
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-8 w-8" aria-label="Notifications">
          <Bell className="h-4 w-4 text-muted-foreground" />
          {unread > 0 && (
            <span
              data-testid="unread-badge"
              className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold text-accent-foreground"
            >
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-border/40 px-3 py-2">
          <p className="text-sm font-medium text-foreground">Reminders</p>
          {unread > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 gap-1 px-2 text-[11px] text-accent"
              onClick={handleMarkAll}
            >
              <CheckCheck className="h-3 w-3" />
              Mark all read
            </Button>
          )}
        </div>
        <div className="max-h-80 overflow-y-auto">
          {reminders.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              You're all caught up.
            </p>
          ) : (
            reminders.map((reminder) => {
              const Icon = TYPE_ICONS[reminder.reminder_type] || Bell;
              const accent = TYPE_ACCENTS[reminder.reminder_type] || "text-muted-foreground";
              return (
                <button
                  key={reminder.id}
                  type="button"
                  onClick={() => handleMarkRead(reminder)}
                  className={`flex w-full items-start gap-2.5 border-b border-border/20 px-3 py-2.5 text-left transition-colors hover:bg-card/60 ${
                    reminder.is_read ? "opacity-60" : ""
                  }`}
                >
                  <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${accent}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {reminder.title}
                    </span>
                    {reminder.message && (
                      <span className="block text-xs leading-snug text-muted-foreground">
                        {reminder.message}
                      </span>
                    )}
                    <span className="mt-0.5 block text-[10px] text-muted-foreground">
                      {timeAgo(reminder.trigger_at)}
                    </span>
                  </span>
                  {!reminder.is_read && (
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" />
                  )}
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
