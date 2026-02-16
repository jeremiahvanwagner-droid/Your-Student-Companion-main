import { useRef, useEffect } from "react";
import { AlertTriangle, Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const TOTAL_WEEKS = 16;
const DANGER_WEEKS = [8, 15]; // Midterms and Finals
const CURRENT_WEEK = 6; // Simulated current week - can be made dynamic

const TruthLine = () => {
  const scrollContainerRef = useRef(null);

  // Auto-scroll to current week on mount
  useEffect(() => {
    if (scrollContainerRef.current) {
      const currentWeekElement = scrollContainerRef.current.querySelector(
        `[data-week="${CURRENT_WEEK}"]`
      );
      if (currentWeekElement) {
        currentWeekElement.scrollIntoView({
          behavior: "smooth",
          inline: "center",
          block: "nearest",
        });
      }
    }
  }, []);

  const scroll = (direction) => {
    if (scrollContainerRef.current) {
      const scrollAmount = direction === "left" ? -200 : 200;
      scrollContainerRef.current.scrollBy({
        left: scrollAmount,
        behavior: "smooth",
      });
    }
  };

  const getWeekStatus = (week) => {
    if (DANGER_WEEKS.includes(week)) return "danger";
    if (week === CURRENT_WEEK) return "current";
    if (week < CURRENT_WEEK) return "completed";
    return "upcoming";
  };

  const getWeekLabel = (week) => {
    if (week === 8) return "Midterms";
    if (week === 15) return "Finals";
    if (week === CURRENT_WEEK) return "Current";
    return `Week ${week}`;
  };

  return (
    <div className="w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-accent" />
          <span className="text-sm font-medium text-foreground">Truth-Line</span>
          <Badge variant="outline" className="text-xs border-border/50 text-muted-foreground">
            Semester Progress
          </Badge>
        </div>
        
        {/* Scroll Controls */}
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={() => scroll("left")}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={() => scroll("right")}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Week Timeline */}
      <div className="relative">
        {/* Progress bar background */}
        <div className="absolute top-1/2 left-0 right-0 h-1 bg-secondary/50 -translate-y-1/2 rounded-full" />
        
        {/* Progress bar fill */}
        <div 
          className="absolute top-1/2 left-0 h-1 bg-accent/50 -translate-y-1/2 rounded-full transition-all duration-500"
          style={{ width: `${((CURRENT_WEEK - 1) / (TOTAL_WEEKS - 1)) * 100}%` }}
        />

        {/* Scrollable week markers */}
        <div
          ref={scrollContainerRef}
          className="flex gap-2 overflow-x-auto pb-2 pt-1 scrollbar-hide scroll-smooth"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          <TooltipProvider delayDuration={200}>
            {Array.from({ length: TOTAL_WEEKS }, (_, i) => i + 1).map((week) => {
              const status = getWeekStatus(week);
              const isDanger = status === "danger";
              const isCurrent = status === "current";
              const isCompleted = status === "completed";

              return (
                <Tooltip key={week}>
                  <TooltipTrigger asChild>
                    <button
                      data-week={week}
                      className={`
                        relative flex flex-col items-center justify-center
                        min-w-[52px] h-16 rounded-lg
                        transition-all duration-300
                        ${isDanger 
                          ? "bg-destructive/20 border-2 border-destructive/50 hover:border-destructive" 
                          : isCurrent
                            ? "bg-accent/20 border-2 border-accent hover:bg-accent/30 shadow-glow"
                            : isCompleted
                              ? "bg-secondary/30 border border-border/30 hover:border-border/50"
                              : "bg-card/50 border border-border/30 hover:border-border/50"
                        }
                      `}
                    >
                      {/* Danger indicator */}
                      {isDanger && (
                        <div className="absolute -top-1 -right-1">
                          <AlertTriangle className="w-3.5 h-3.5 text-destructive animate-pulse" />
                        </div>
                      )}

                      {/* Week number */}
                      <span className={`
                        text-sm font-semibold
                        ${isDanger 
                          ? "text-destructive" 
                          : isCurrent 
                            ? "text-accent" 
                            : isCompleted
                              ? "text-muted-foreground"
                              : "text-foreground"
                        }
                      `}>
                        {week}
                      </span>

                      {/* Week label */}
                      <span className={`
                        text-[10px] leading-tight
                        ${isDanger 
                          ? "text-destructive/80" 
                          : isCurrent 
                            ? "text-accent/80" 
                            : "text-muted-foreground/70"
                        }
                      `}>
                        {isDanger ? (week === 8 ? "Mid" : "Final") : "Week"}
                      </span>

                      {/* Current week indicator dot */}
                      {isCurrent && (
                        <div className="absolute -bottom-1 w-2 h-2 bg-accent rounded-full animate-pulse" />
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent 
                    side="bottom" 
                    className={`
                      ${isDanger 
                        ? "bg-destructive text-destructive-foreground border-destructive" 
                        : "bg-popover text-popover-foreground border-border"
                      }
                    `}
                  >
                    <div className="text-center">
                      <p className="font-medium">{getWeekLabel(week)}</p>
                      {isDanger && (
                        <p className="text-xs opacity-80">
                          {week === 8 ? "Midterm Exams" : "Final Exams"} - Danger Zone!
                        </p>
                      )}
                      {isCurrent && (
                        <p className="text-xs opacity-80">You are here</p>
                      )}
                    </div>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </TooltipProvider>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 mt-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-accent" />
          <span>Current</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-destructive" />
          <span>Danger Zone</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-secondary" />
          <span>Completed</span>
        </div>
      </div>
    </div>
  );
};

export default TruthLine;
