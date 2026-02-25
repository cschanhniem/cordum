import { cn } from "@/lib/utils";

type BadgeVariant = "healthy" | "warning" | "danger" | "info" | "muted" | "cordum";

const variants: Record<BadgeVariant, string> = {
  healthy: "bg-status-healthy/12 text-status-healthy border-status-healthy/20",
  warning: "bg-status-warning/12 text-status-warning border-status-warning/20",
  danger: "bg-status-danger/12 text-status-danger border-status-danger/20",
  info: "bg-status-info/12 text-status-info border-status-info/20",
  muted: "bg-muted-foreground/8 text-muted-foreground border-muted-foreground/15",
  cordum: "bg-cordum/12 text-cordum border-cordum/20",
};

interface StatusBadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  dot?: boolean;
  className?: string;
  pulse?: boolean;
}

export function StatusBadge({
  variant = "muted",
  children,
  dot = false,
  className,
  pulse = false,
}: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium font-mono uppercase tracking-wider border",
        variants[variant],
        className,
      )}
    >
      {dot && (
        <span className="relative flex h-1.5 w-1.5">
          {pulse && (
            <span
              className={cn(
                "absolute inset-0 rounded-full animate-ping opacity-75",
                variant === "healthy" && "bg-status-healthy",
                variant === "warning" && "bg-status-warning",
                variant === "danger" && "bg-status-danger",
                variant === "info" && "bg-status-info",
                variant === "cordum" && "bg-cordum",
                variant === "muted" && "bg-muted-foreground",
              )}
            />
          )}
          <span
            className={cn(
              "relative inline-flex rounded-full h-1.5 w-1.5",
              variant === "healthy" && "bg-status-healthy",
              variant === "warning" && "bg-status-warning",
              variant === "danger" && "bg-status-danger",
              variant === "info" && "bg-status-info",
              variant === "cordum" && "bg-cordum",
              variant === "muted" && "bg-muted-foreground",
            )}
          />
        </span>
      )}
      {children}
    </span>
  );
}
