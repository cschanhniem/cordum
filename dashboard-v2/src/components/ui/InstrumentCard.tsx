import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

type AccentVariant = "healthy" | "warning" | "danger" | "info" | "muted" | "cordum";

const accentColors: Record<AccentVariant, string> = {
  healthy: "bg-status-healthy",
  warning: "bg-status-warning",
  danger: "bg-status-danger",
  info: "bg-status-info",
  muted: "bg-muted-foreground/40",
  cordum: "bg-cordum",
};

interface InstrumentCardProps {
  accent?: AccentVariant;
  className?: string;
  children: ReactNode;
  onClick?: () => void;
  hoverable?: boolean;
}

export function InstrumentCard({
  accent = "cordum",
  className,
  children,
  onClick,
  hoverable = false,
}: InstrumentCardProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "rounded-lg border border-border bg-card overflow-hidden transition-all duration-200",
        hoverable && "hover:shadow-[var(--shadow-md)] hover:border-cordum/15 cursor-pointer",
        onClick && "cursor-pointer",
        className,
      )}
      style={{ boxShadow: "var(--shadow-sm)" }}
    >
      <div className={cn("h-[3px]", accentColors[accent])} />
      {children}
    </div>
  );
}

interface InstrumentCardHeaderProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}

export function InstrumentCardHeader({
  title,
  subtitle,
  action,
  icon,
  className,
}: InstrumentCardHeaderProps) {
  return (
    <div className={cn("flex items-center justify-between px-5 pt-4 pb-2", className)}>
      <div className="flex items-center gap-2.5">
        {icon && (
          <div className="w-8 h-8 rounded-md bg-cordum/10 flex items-center justify-center text-cordum">
            {icon}
          </div>
        )}
        <div>
          <h3 className="text-sm font-semibold font-display text-foreground">{title}</h3>
          {subtitle && (
            <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
          )}
        </div>
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}

interface InstrumentCardBodyProps {
  className?: string;
  children: ReactNode;
}

export function InstrumentCardBody({ className, children }: InstrumentCardBodyProps) {
  return <div className={cn("px-5 pb-5", className)}>{children}</div>;
}

interface InstrumentCardFooterProps {
  className?: string;
  children: ReactNode;
}

export function InstrumentCardFooter({ className, children }: InstrumentCardFooterProps) {
  return (
    <div className={cn("px-5 py-3 border-t border-border bg-surface-2/30", className)}>
      {children}
    </div>
  );
}
