import { useState, useRef, useEffect } from "react";
import { 
  Sparkles, 
  Copy, 
  Check, 
  ArrowRight, 
  Lightbulb,
  BookOpen,
  Zap,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { shiftText } from "@/utils/contextShifter";

// Individual Truth Card component
const TruthCardPopup = ({ card, onCopy, copiedWord }) => {
  return (
    <div className="p-3 rounded-lg bg-secondary/30 border border-border/50 hover:border-accent/30 transition-all">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm text-muted-foreground line-through">{card.original}</span>
            <ArrowRight className="w-3 h-3 text-muted-foreground" />
            <button
              onClick={() => onCopy(card.upgrade)}
              className="text-sm font-medium text-accent hover:text-accent/80 transition-colors flex items-center gap-1 group"
            >
              {card.upgrade}
              {copiedWord === card.upgrade ? (
                <Check className="w-3 h-3" />
              ) : (
                <Copy className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
              )}
            </button>
          </div>
          <p className="text-xs text-muted-foreground/80 flex items-start gap-1">
            <Lightbulb className="w-3 h-3 mt-0.5 shrink-0 text-accent/50" />
            {card.truthContext}
          </p>
        </div>
      </div>
    </div>
  );
};

const ContextShifterUI = () => {
  const [inputText, setInputText] = useState("");
  const [result, setResult] = useState(null);
  const [copiedWord, setCopiedWord] = useState(null);
  const [showAllCards, setShowAllCards] = useState(false);
  const textareaRef = useRef(null);

  // Process text on input change
  useEffect(() => {
    if (inputText.trim()) {
      const shiftResult = shiftText(inputText);
      setResult(shiftResult);
    } else {
      setResult(null);
    }
  }, [inputText]);

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text);
    setCopiedWord(text);
    toast.success(`"${text}" copied!`);
    setTimeout(() => setCopiedWord(null), 2000);
  };

  const handleCopyAll = () => {
    if (result) {
      // Copy the shifted text with brackets removed and academic words in place
      const cleanedText = result.shiftedText.replace(/\[([^\]]+)\]/g, '$1').toLowerCase();
      navigator.clipboard.writeText(cleanedText);
      toast.success("Academic version copied to clipboard!");
    }
  };

  const handleClearInput = () => {
    setInputText("");
    setResult(null);
    textareaRef.current?.focus();
  };

  // Get cards to display (limited or all)
  const displayedCards = showAllCards 
    ? result?.truthCards || [] 
    : (result?.truthCards || []).slice(0, 5);
  
  const hasMoreCards = (result?.truthCards?.length || 0) > 5;

  return (
    <Card className="bg-card/50 border-border/30">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-accent" />
            <span className="text-foreground">Context Shifter</span>
            <Badge variant="outline" className="text-xs border-accent/30 text-accent">
              Academic Mode
            </Badge>
          </div>
          {result && result.improvementCount > 0 && (
            <Badge className="bg-accent/10 text-accent border-accent/20">
              <Zap className="w-3 h-3 mr-1" />
              {result.improvementCount} upgrades
            </Badge>
          )}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Input Area */}
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground uppercase tracking-wider">
            Enter your text
          </label>
          <Textarea
            ref={textareaRef}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Type or paste your essay text here... Try: 'The data shows a big change in the bad results.'"
            className="min-h-[100px] bg-background border-border/50 focus:border-accent/50 text-foreground placeholder:text-muted-foreground/50 resize-none"
          />
          {inputText && (
            <div className="flex justify-end">
              <button
                onClick={handleClearInput}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Clear
              </button>
            </div>
          )}
        </div>

        {/* Results Area */}
        {result && result.truthCards.length > 0 && (
          <div className="space-y-4 animate-fadeIn">
            {/* Improvement Progress */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Academic improvement</span>
                <span className="text-accent font-medium">{result.improvementPercentage}%</span>
              </div>
              <Progress value={result.improvementPercentage} className="h-1.5 bg-secondary/50" />
            </div>

            {/* Shifted Text Preview */}
            <div className="p-3 rounded-lg bg-accent/5 border border-accent/20">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-accent uppercase tracking-wider flex items-center gap-1">
                  <BookOpen className="w-3 h-3" />
                  Academic Version
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCopyAll}
                  className="h-7 text-xs text-accent hover:text-accent hover:bg-accent/10"
                >
                  <Copy className="w-3 h-3 mr-1" />
                  Copy All
                </Button>
              </div>
              <p className="text-sm text-foreground leading-relaxed">
                {result.shiftedText.split(/\[([^\]]+)\]/).map((part, idx) => {
                  // Odd indices are the matched groups (upgraded words)
                  if (idx % 2 === 1) {
                    return (
                      <span key={idx} className="text-accent font-medium bg-accent/10 px-1 rounded">
                        {part.toLowerCase()}
                      </span>
                    );
                  }
                  return <span key={idx}>{part}</span>;
                })}
              </p>
            </div>

            {/* Truth Cards */}
            <div className="space-y-2">
              <span className="text-xs text-muted-foreground uppercase tracking-wider">
                Truth Cards ({result.truthCards.length} suggestions)
              </span>
              <div className="space-y-2">
                {displayedCards.map((card, idx) => (
                  <TruthCardPopup 
                    key={`${card.original}-${idx}`} 
                    card={card} 
                    onCopy={handleCopy}
                    copiedWord={copiedWord}
                  />
                ))}
              </div>
              
              {hasMoreCards && (
                <button
                  onClick={() => setShowAllCards(!showAllCards)}
                  className="w-full flex items-center justify-center gap-1 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showAllCards ? (
                    <>
                      Show less <ChevronUp className="w-3 h-3" />
                    </>
                  ) : (
                    <>
                      Show {result.truthCards.length - 5} more <ChevronDown className="w-3 h-3" />
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Empty State */}
        {inputText && result && result.truthCards.length === 0 && (
          <div className="text-center py-6">
            <Check className="w-8 h-8 text-accent mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              Your text is already academically strong!
            </p>
          </div>
        )}

        {/* Helper Text */}
        {!inputText && (
          <div className="text-center py-4">
            <p className="text-xs text-muted-foreground/60">
              💡 Tip: Paste your essay or thesis statement to get instant academic upgrades
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ContextShifterUI;
