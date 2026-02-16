import { Loader2 } from "lucide-react";

const LoadingState = () => {
  return (
    <div className="flex flex-col items-center justify-center py-12 space-y-4">
      {/* Animated loader */}
      <div className="relative">
        <div className="w-12 h-12 rounded-full border-2 border-border" />
        <div className="absolute inset-0 w-12 h-12 rounded-full border-2 border-accent border-t-transparent animate-spin" />
      </div>
      
      {/* Loading text */}
      <div className="text-center space-y-1">
        <p className="text-sm text-muted-foreground">Searching...</p>
        <p className="text-xs text-muted-foreground/60">Fetching definition</p>
      </div>
      
      {/* Skeleton preview */}
      <div className="w-full max-w-md space-y-3 mt-4">
        <div className="animate-shimmer h-8 w-32 rounded-lg" />
        <div className="animate-shimmer h-4 w-full rounded" />
        <div className="animate-shimmer h-4 w-3/4 rounded" />
        <div className="animate-shimmer h-4 w-5/6 rounded" />
      </div>
    </div>
  );
};

export default LoadingState;
