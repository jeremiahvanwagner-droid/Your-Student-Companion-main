import ContextShifterUI from "@/components/ContextShifterUI";

export default function ShifterPage() {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-accent">Academic Writing Assistant</p>
        <h1 className="text-2xl font-semibold text-foreground">Context Shifter</h1>
        <p className="text-sm text-muted-foreground">Transform everyday language into clear academic writing.</p>
      </div>

      <ContextShifterUI />
    </div>
  );
}
