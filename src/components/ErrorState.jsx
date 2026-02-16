import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

const ErrorState = ({ message, onRetry }) => {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center mb-6">
        <AlertCircle className="w-7 h-7 text-destructive" />
      </div>
      
      <h3 className="text-lg font-medium text-foreground mb-2">
        Something went wrong
      </h3>
      
      <p className="text-sm text-muted-foreground max-w-xs mb-6">
        {message || "Unable to fetch the definition. Please try again."}
      </p>

      <Button
        variant="outline"
        onClick={onRetry}
        className="border-border/50 text-foreground hover:border-accent/50 hover:text-accent gap-2"
      >
        <RefreshCw className="w-4 h-4" />
        Try Again
      </Button>
    </div>
  );
};

export default ErrorState;
