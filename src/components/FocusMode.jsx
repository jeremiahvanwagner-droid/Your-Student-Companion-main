import { useState, useEffect, useCallback, useRef } from "react";
import { Focus, Play, Pause, RotateCcw, X, Trophy, Clock, Flame } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { createStudySession, completeStudySession, createFocusLog } from "@/lib/focusApi";

const FOCUS_DURATION = 25 * 60; // 25 minutes in seconds
const STORAGE_KEY = "studentCompanion_minutesFocused";

// Get minutes focused from localStorage
const getMinutesFocused = () => {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored ? parseInt(stored, 10) : 0;
};

// Save minutes focused to localStorage
const saveMinutesFocused = (minutes) => {
  localStorage.setItem(STORAGE_KEY, minutes.toString());
};

const FocusMode = ({ onFocusStateChange }) => {
  const [isActive, setIsActive] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(FOCUS_DURATION);
  const [totalMinutesFocused, setTotalMinutesFocused] = useState(getMinutesFocused());
  const [showOverlay, setShowOverlay] = useState(false);
  const intervalRef = useRef(null);
  const startTimeRef = useRef(null);
  const sessionIdRef = useRef(null);

  // Format time as MM:SS
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // Calculate progress percentage
  const progressPercent = ((FOCUS_DURATION - timeRemaining) / FOCUS_DURATION) * 100;

  // Handle timer completion
  const handleComplete = useCallback(() => {
    // Add 25 minutes to the total
    const newTotal = totalMinutesFocused + 25;
    setTotalMinutesFocused(newTotal);
    saveMinutesFocused(newTotal);

    // Sync to server (best-effort)
    const sid = sessionIdRef.current;
    if (sid) {
      completeStudySession(sid, { duration_actual_minutes: 25 }).catch(() => {});
      createFocusLog({
        study_session_id: sid,
        focus_minutes: 25,
        break_minutes: 0,
        distractions_noted: 0,
      }).catch(() => {});
      sessionIdRef.current = null;
    }

    // Show success toast
    toast.success("Focus session complete!", {
      description: `You've focused for ${newTotal} minutes total. Great work!`,
      duration: 5000,
    });

    // Reset state
    setIsActive(false);
    setIsPaused(false);
    setTimeRemaining(FOCUS_DURATION);
    setShowOverlay(false);
    onFocusStateChange?.(false);
  }, [totalMinutesFocused, onFocusStateChange]);

  // Timer effect
  useEffect(() => {
    if (isActive && !isPaused) {
      intervalRef.current = setInterval(() => {
        setTimeRemaining((prev) => {
          if (prev <= 1) {
            clearInterval(intervalRef.current);
            handleComplete();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isActive, isPaused, handleComplete]);

  // Prevent navigation while focus mode is active
  useEffect(() => {
    if (showOverlay) {
      // Disable scrolling on body
      document.body.style.overflow = "hidden";
      
      // Handle escape key to show warning (not exit)
      const handleKeyDown = (e) => {
        if (e.key === "Escape" && isActive) {
          toast.warning("Stay focused! Complete your session to earn your reward.", {
            duration: 2000,
          });
        }
      };

      window.addEventListener("keydown", handleKeyDown);

      return () => {
        document.body.style.overflow = "";
        window.removeEventListener("keydown", handleKeyDown);
      };
    }
  }, [showOverlay, isActive]);

  const startFocus = () => {
    setShowOverlay(true);
    setIsActive(true);
    setIsPaused(false);
    startTimeRef.current = Date.now();
    onFocusStateChange?.(true);

    // Create server-side study session (best-effort)
    createStudySession({
      duration_planned_minutes: 25,
      session_type: "pomodoro",
    })
      .then((res) => {
        sessionIdRef.current = res?.session?.id || null;
      })
      .catch(() => {
        sessionIdRef.current = null;
      });
    
    toast.info("Focus mode activated!", {
      description: "Stay focused for 25 minutes to earn your reward.",
      duration: 3000,
    });
  };

  const togglePause = () => {
    setIsPaused(!isPaused);
  };

  const resetTimer = () => {
    setTimeRemaining(FOCUS_DURATION);
    setIsPaused(true);
  };

  const exitFocus = () => {
    if (isActive && timeRemaining < FOCUS_DURATION) {
      // Calculate partial minutes
      const minutesCompleted = Math.floor((FOCUS_DURATION - timeRemaining) / 60);
      if (minutesCompleted > 0) {
        const newTotal = totalMinutesFocused + minutesCompleted;
        setTotalMinutesFocused(newTotal);
        saveMinutesFocused(newTotal);
        toast.info(`Partial session saved: ${minutesCompleted} minutes added.`);

        // Sync partial session to server (best-effort)
        const sid = sessionIdRef.current;
        if (sid) {
          completeStudySession(sid, { duration_actual_minutes: minutesCompleted }).catch(() => {});
          createFocusLog({
            study_session_id: sid,
            focus_minutes: minutesCompleted,
            break_minutes: 0,
            distractions_noted: 0,
          }).catch(() => {});
        }
      }
    }

    sessionIdRef.current = null;
    setIsActive(false);
    setIsPaused(false);
    setTimeRemaining(FOCUS_DURATION);
    setShowOverlay(false);
    onFocusStateChange?.(false);
  };

  return (
    <>
      {/* Focus Button - shown in normal view */}
      <Button
        onClick={startFocus}
        size="lg"
        className="
          relative overflow-hidden
          h-11 px-5
          bg-gradient-to-r from-[#020c1b] to-[#0a192f]
          hover:from-[#0a192f] hover:to-[#112240]
          text-accent border border-accent/30
          hover:border-accent/50 hover:shadow-glow
          transition-all duration-300
          gap-2
        "
      >
        <Focus className="w-4 h-4" />
        <span>Focus Mode</span>
        {totalMinutesFocused > 0 && (
          <span className="ml-1 px-1.5 py-0.5 text-xs bg-accent/20 rounded-full">
            {totalMinutesFocused}m
          </span>
        )}
      </Button>

      {/* Full-screen Focus Overlay */}
      {showOverlay && (
        <div 
          className="
            fixed inset-0 z-[100]
            flex flex-col items-center justify-center
            transition-all duration-500
          "
          style={{ backgroundColor: "#020c1b" }}
        >
          {/* Ambient glow effect */}
          <div 
            className="absolute inset-0 opacity-30"
            style={{
              background: `radial-gradient(circle at 50% 50%, rgba(100, 255, 218, 0.1) 0%, transparent 50%)`,
            }}
          />

          {/* Exit button - only shown when paused */}
          {isPaused && (
            <button
              onClick={exitFocus}
              className="
                absolute top-6 right-6
                p-2 rounded-full
                text-muted-foreground/50 hover:text-muted-foreground
                hover:bg-white/5
                transition-colors
              "
            >
              <X className="w-6 h-6" />
            </button>
          )}

          {/* Stats badge */}
          <div className="absolute top-6 left-6 flex items-center gap-2">
            <div className="
              flex items-center gap-2 px-3 py-1.5
              bg-white/5 rounded-full
              border border-white/10
            ">
              <Trophy className="w-4 h-4 text-accent" />
              <span className="text-sm text-foreground/80">
                {totalMinutesFocused} minutes focused
              </span>
            </div>
          </div>

          {/* Main timer content */}
          <div className="relative z-10 text-center">
            {/* Status indicator */}
            <div className="flex items-center justify-center gap-2 mb-8">
              <div className={`
                w-3 h-3 rounded-full
                ${isPaused ? "bg-warning animate-pulse" : "bg-accent animate-pulse"}
              `} />
              <span className="text-sm uppercase tracking-[0.2em] text-muted-foreground">
                {isPaused ? "Paused" : "Focusing"}
              </span>
            </div>

            {/* Timer display */}
            <div className="mb-8">
              <p className="
                text-7xl sm:text-8xl md:text-9xl
                font-light tracking-tight
                text-foreground
                font-mono
                tabular-nums
              ">
                {formatTime(timeRemaining)}
              </p>
            </div>

            {/* Progress bar */}
            <div className="w-64 sm:w-80 mx-auto mb-10">
              <Progress 
                value={progressPercent} 
                className="h-1.5 bg-white/10"
              />
              <p className="text-xs text-muted-foreground/60 mt-2">
                {Math.round(progressPercent)}% complete
              </p>
            </div>

            {/* Control buttons */}
            <div className="flex items-center justify-center gap-4">
              <Button
                variant="outline"
                size="icon"
                onClick={resetTimer}
                disabled={timeRemaining === FOCUS_DURATION}
                className="
                  h-12 w-12 rounded-full
                  border-white/20 text-muted-foreground
                  hover:border-white/30 hover:text-foreground
                  hover:bg-white/5
                  disabled:opacity-30
                "
              >
                <RotateCcw className="w-5 h-5" />
              </Button>

              <Button
                onClick={togglePause}
                className="
                  h-16 w-16 rounded-full
                  bg-accent text-accent-foreground
                  hover:bg-accent/90
                  shadow-glow-strong
                  transition-all duration-300
                "
              >
                {isPaused ? (
                  <Play className="w-6 h-6 ml-0.5" />
                ) : (
                  <Pause className="w-6 h-6" />
                )}
              </Button>

              <Button
                variant="outline"
                size="icon"
                onClick={exitFocus}
                className="
                  h-12 w-12 rounded-full
                  border-destructive/30 text-destructive/70
                  hover:border-destructive/50 hover:text-destructive
                  hover:bg-destructive/10
                "
              >
                <X className="w-5 h-5" />
              </Button>
            </div>

            {/* Motivational text */}
            <p className="mt-10 text-sm text-muted-foreground/50 max-w-xs mx-auto">
              {isPaused 
                ? "Take a breath. Resume when ready."
                : "Deep work creates mastery. Stay present."
              }
            </p>
          </div>

          {/* Streak indicator */}
          {totalMinutesFocused >= 50 && (
            <div className="absolute bottom-6 flex items-center gap-2 text-warning">
              <Flame className="w-4 h-4" />
              <span className="text-xs">
                {Math.floor(totalMinutesFocused / 25)} sessions completed!
              </span>
            </div>
          )}
        </div>
      )}
    </>
  );
};

export default FocusMode;
