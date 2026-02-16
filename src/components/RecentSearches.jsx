import { Clock, X, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const RecentSearches = ({ searches, onSearchClick, onClear }) => {
  if (!searches || searches.length === 0) return null;

  return (
    <Card className="bg-card/50 border-border/30">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Recent Searches
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClear}
            className="text-xs text-muted-foreground hover:text-destructive h-auto p-1"
          >
            Clear all
          </Button>
        </div>
      </CardHeader>
      
      <CardContent className="pt-0">
        <div className="flex flex-wrap gap-2">
          {searches.map((word, idx) => (
            <button
              key={idx}
              onClick={() => onSearchClick(word)}
              className="
                group flex items-center gap-1.5 px-3 py-1.5
                bg-secondary/30 hover:bg-secondary/50
                border border-border/30 hover:border-accent/30
                rounded-lg text-sm text-foreground
                transition-all
              "
            >
              <span className="capitalize">{word}</span>
              <ArrowUpRight className="w-3 h-3 text-muted-foreground group-hover:text-accent transition-colors" />
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default RecentSearches;
