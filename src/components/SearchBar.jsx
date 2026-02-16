import { useState } from "react";
import { Search, X, ArrowRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const SearchBar = ({ value, onChange, onSearch }) => {
  const [isFocused, setIsFocused] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (value.trim()) {
      onSearch(value);
    }
  };

  const handleClear = () => {
    onChange("");
  };

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-lg mx-auto">
      <div 
        className={`
          relative flex items-center gap-2 p-1.5
          bg-card border rounded-xl
          transition-all duration-300
          ${isFocused 
            ? 'border-accent shadow-glow' 
            : 'border-border hover:border-muted-foreground/30'
          }
        `}
      >
        {/* Search Icon */}
        <div className="pl-3">
          <Search className={`w-5 h-5 transition-colors duration-300 ${
            isFocused ? 'text-accent' : 'text-muted-foreground'
          }`} />
        </div>

        {/* Input */}
        <Input
          type="text"
          placeholder="Search any word..."
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          className="flex-1 border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 text-foreground placeholder:text-muted-foreground text-base"
        />

        {/* Clear Button */}
        {value && (
          <button
            type="button"
            onClick={handleClear}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}

        {/* Search Button */}
        <Button
          type="submit"
          size="sm"
          disabled={!value.trim()}
          className="bg-accent text-accent-foreground hover:bg-accent/90 disabled:opacity-40 rounded-lg px-4 font-medium transition-all hover:shadow-glow"
        >
          <span className="hidden sm:inline mr-1">Search</span>
          <ArrowRight className="w-4 h-4" />
        </Button>
      </div>

      {/* Helper Text */}
      <p className="text-center text-xs text-muted-foreground mt-3">
        Try: "ephemeral", "mitosis", or "macroeconomics"
      </p>
    </form>
  );
};

export default SearchBar;
