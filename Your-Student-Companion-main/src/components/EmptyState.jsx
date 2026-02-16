import { Search, BookOpen, Lightbulb } from "lucide-react";

const EmptyState = ({ isInitial = false }) => {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="relative mb-6">
        <div className="w-16 h-16 rounded-2xl bg-secondary/30 flex items-center justify-center">
          {isInitial ? (
            <Search className="w-7 h-7 text-muted-foreground" />
          ) : (
            <BookOpen className="w-7 h-7 text-muted-foreground" />
          )}
        </div>
        <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-lg bg-accent/20 flex items-center justify-center">
          <Lightbulb className="w-3.5 h-3.5 text-accent" />
        </div>
      </div>
      
      <h3 className="text-lg font-medium text-foreground mb-2">
        {isInitial ? "Start Your Search" : "No Results"}
      </h3>
      
      <p className="text-sm text-muted-foreground max-w-xs">
        {isInitial 
          ? "Type any word above to discover its definition and academic alternatives."
          : "We couldn't find what you're looking for. Try searching for a different word."
        }
      </p>

      {/* Suggested searches */}
      {isInitial && (
        <div className="mt-6 space-y-2">
          <p className="text-xs text-muted-foreground/60 uppercase tracking-wider">
            Popular searches
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {['ephemeral', 'paradigm', 'ubiquitous', 'pragmatic'].map(word => (
              <span 
                key={word}
                className="px-3 py-1 text-xs rounded-full bg-secondary/30 text-muted-foreground border border-border/30"
              >
                {word}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default EmptyState;
