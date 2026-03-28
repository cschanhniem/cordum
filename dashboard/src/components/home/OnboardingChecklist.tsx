import { useNavigate } from "react-router-dom";
import { CheckCircle2, ArrowRight, Cpu, Workflow, ShieldCheck, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";

interface OnboardingChecklistProps {
  jobs: number;
  workers: number;
  workflows?: number;
  onDismiss: () => void;
}

const steps = [
  {
    id: "agent",
    title: "Connect your first agent",
    description: "Register a worker to start processing jobs.",
    icon: Cpu,
    path: "/agents",
    check: (p: OnboardingChecklistProps) => p.workers > 0,
  },
  {
    id: "workflow",
    title: "Create a workflow",
    description: "Design a multi-step orchestration pipeline.",
    icon: Workflow,
    path: "/workflows",
    check: (p: OnboardingChecklistProps) => (p.workflows ?? 0) > 0,
  },
  {
    id: "safety",
    title: "Configure safety rules",
    description: "Set up input/output policies for governance.",
    icon: ShieldCheck,
    path: "/govern/overview",
    check: () => false, // can't easily check from props
  },
  {
    id: "job",
    title: "Submit a test job",
    description: "Send your first job through the platform.",
    icon: Zap,
    path: "/jobs",
    check: (p: OnboardingChecklistProps) => p.jobs > 0,
  },
];

export function OnboardingChecklist(props: OnboardingChecklistProps) {
  const navigate = useNavigate();
  const completedCount = steps.filter((s) => s.check(props)).length;

  return (
    <div className="instrument-card border-l-2 border-cordum">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-display font-semibold text-sm text-foreground">Get Started</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {completedCount}/{steps.length} steps completed
          </p>
        </div>
        <button
          type="button"
          onClick={props.onDismiss}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Dismiss
        </button>
      </div>
      <div className="space-y-3">
        {steps.map((step, idx) => {
          const done = step.check(props);
          return (
            <button
              key={step.id}
              type="button"
              onClick={() => navigate(step.path)}
              className={cn(
                "w-full flex items-center gap-3 rounded-xl p-3 text-left transition-colors",
                done
                  ? "bg-[var(--color-success)]/5 border border-[var(--color-success)]/20"
                  : "bg-surface-1 border border-border hover:border-cordum/30",
              )}
            >
              <div className={cn(
                "w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-bold",
                done
                  ? "bg-[var(--color-success)]/20 text-[var(--color-success)]"
                  : "bg-surface-2 text-muted-foreground",
              )}>
                {done ? <CheckCircle2 className="w-4 h-4" /> : idx + 1}
              </div>
              <div className="flex-1 min-w-0">
                <p className={cn("text-sm font-semibold", done ? "text-[var(--color-success)]" : "text-foreground")}>
                  {step.title}
                </p>
                <p className="text-xs text-muted-foreground">{step.description}</p>
              </div>
              {!done && <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
