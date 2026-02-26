/*
 * ScopeTabs — Level 2 sub-tabs for Input Policy and Output Policy pages.
 * Shows scope tabs with live badge counts.
 */
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export interface ScopeTab {
  id: string;
  label: string;
  count: number;
}

interface ScopeTabsProps {
  tabs: ScopeTab[];
  active: string;
  onChange: (id: string) => void;
}

export function ScopeTabs({ tabs, active, onChange }: ScopeTabsProps) {
  return (
    <div className="flex items-center gap-1 mb-5">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={cn(
            "relative flex items-center gap-1.5 px-3.5 py-2 rounded-md text-xs font-medium transition-all",
            active === tab.id
              ? "bg-surface-2 text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-surface-2/50",
          )}
        >
          {tab.label}
          <span
            className={cn(
              "inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-mono font-bold",
              active === tab.id
                ? "bg-cordum/15 text-cordum"
                : "bg-surface-2 text-muted-foreground",
            )}
          >
            {tab.count}
          </span>
          {active === tab.id && (
            <motion.div
              layoutId="scope-tab-bg"
              className="absolute inset-0 rounded-md border border-border bg-surface-2 -z-10"
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
            />
          )}
        </button>
      ))}
    </div>
  );
}
