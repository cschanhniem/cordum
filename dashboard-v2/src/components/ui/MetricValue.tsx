import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface MetricValueProps {
  value: string | number;
  label: string;
  trend?: { value: number; label?: string };
  unit?: string;
  className?: string;
  size?: "sm" | "md" | "lg";
}

export function MetricValue({
  value,
  label,
  trend,
  unit,
  className,
  size = "md",
}: MetricValueProps) {
  const trendDirection =
    trend && trend.value > 0 ? "up" : trend && trend.value < 0 ? "down" : "flat";

  return (
    <div className={cn("flex flex-col", className)}>
      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">
        {label}
      </p>
      <div className="flex items-baseline gap-1.5">
        <span
          className={cn(
            "font-display font-bold text-foreground tabular-nums",
            size === "sm" && "text-xl",
            size === "md" && "text-2xl",
            size === "lg" && "text-4xl",
          )}
        >
          {value}
        </span>
        {unit && (
          <span className="text-xs text-muted-foreground font-mono">{unit}</span>
        )}
      </div>
      {trend && (
        <div
          className={cn(
            "flex items-center gap-1 mt-1 text-xs font-medium",
            trendDirection === "up" && "text-status-healthy",
            trendDirection === "down" && "text-status-danger",
            trendDirection === "flat" && "text-muted-foreground",
          )}
        >
          {trendDirection === "up" && <TrendingUp className="w-3 h-3" />}
          {trendDirection === "down" && <TrendingDown className="w-3 h-3" />}
          {trendDirection === "flat" && <Minus className="w-3 h-3" />}
          <span>
            {trend.value > 0 ? "+" : ""}
            {trend.value}%
          </span>
          {trend.label && (
            <span className="text-muted-foreground">{trend.label}</span>
          )}
        </div>
      )}
    </div>
  );
}
