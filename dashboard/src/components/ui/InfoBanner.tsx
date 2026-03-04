import { type ReactNode } from "react";
import { Info, AlertTriangle, AlertCircle, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

type BannerVariant = "info" | "warning" | "error" | "success" | "cordum";

interface InfoBannerProps {
  variant?: BannerVariant;
  title?: string;
  children: ReactNode;
  icon?: ReactNode;
  className?: string;
  id?: string;
}

const variantStyles: Record<BannerVariant, string> = {
  info: "border-blue-500/20 bg-blue-500/10 text-blue-200 after:bg-blue-500",
  warning: "border-amber-500/20 bg-amber-500/10 text-amber-200 after:bg-amber-500",
  error: "border-red-500/20 bg-red-500/10 text-red-200 after:bg-red-500",
  success: "border-emerald-500/20 bg-emerald-500/10 text-emerald-200 after:bg-emerald-500",
  cordum: "border-cordum/20 bg-cordum/10 text-cordum-foreground after:bg-cordum",
};

const iconMap: Record<BannerVariant, typeof Info> = {
  info: Info,
  warning: AlertTriangle,
  error: AlertCircle,
  success: ShieldCheck,
  cordum: ShieldCheck,
};

export function InfoBanner({
  variant = "info",
  title,
  children,
  icon,
  className,
  id,
}: InfoBannerProps) {
  const Icon = iconMap[variant];

  return (
    <div
      id={id}
      className={cn(
        "rounded-lg border p-4 text-xs relative overflow-hidden after:absolute after:left-0 after:top-0 after:bottom-0 after:w-1 shadow-sm",
        variantStyles[variant],
        className
      )}
    >
      <div className="flex gap-3">
        <div className="shrink-0 mt-0.5">
          {icon || <Icon className="h-3.5 w-3.5" />}
        </div>
        <div className="flex-1 min-w-0">
          {title && (
            <div className="mb-1 font-semibold leading-none tracking-tight">
              {title}
            </div>
          )}
          <div className="text-muted-foreground leading-relaxed">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
