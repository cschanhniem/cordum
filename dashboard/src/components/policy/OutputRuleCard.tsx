/*
 * OutputRuleCard — Card for an output policy rule.
 * Accent by decision (PASS/QUARANTINE/REDACT). Scope badge. Scanners, confidence, severity.
 */
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Pencil,
  FlaskConical,
  MoreHorizontal,
  Copy,
  Power,
  Trash2,
  History,
} from "lucide-react";
import { cn } from "@/lib/utils";

type OutputDecision = "pass" | "quarantine" | "redact";
type Severity = "low" | "medium" | "high" | "critical";

const DECISION_COLORS: Record<string, { accent: string; badge: string }> = {
  pass:       { accent: "bg-emerald-500", badge: "bg-emerald-500/15 text-emerald-400" },
  quarantine: { accent: "bg-red-500",     badge: "bg-red-500/15 text-red-400" },
  redact:     { accent: "bg-amber-500",   badge: "bg-amber-500/15 text-amber-400" },
};

const SEVERITY_COLORS: Record<string, string> = {
  low:      "text-muted-foreground",
  medium:   "text-blue-400",
  high:     "text-amber-400",
  critical: "text-red-400",
};

const SCOPE_BADGES: Record<string, { bg: string; text: string }> = {
  global:    { bg: "bg-cordum/15", text: "text-cordum" },
  workflow:  { bg: "bg-blue-500/15", text: "text-blue-400" },
  inherited: { bg: "bg-surface-2", text: "text-muted-foreground" },
};

export interface OutputRule {
  id: string;
  name: string;
  description?: string;
  decision: string;
  severity?: string;
  topics?: string[];
  scanners?: string[];
  confidence_threshold?: number;
  enabled?: boolean;
  scope?: string;
  workflowId?: string;
  // Stats
  triggered_7d?: number;
  false_positives_7d?: number;
}

interface OutputRuleCardProps {
  rule: OutputRule;
  scope?: "global" | "workflow" | "inherited";
  scopeLabel?: string;
  dimmed?: boolean;
  onEdit?: () => void;
  onTest?: () => void;
  onDuplicate?: () => void;
  onToggle?: () => void;
  onDelete?: () => void;
  onViewHistory?: () => void;
}

export function OutputRuleCard({
  rule,
  scope = "global",
  scopeLabel,
  dimmed = false,
  onEdit,
  onTest,
  onDuplicate,
  onToggle,
  onDelete,
  onViewHistory,
}: OutputRuleCardProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const decision = (rule.decision?.toLowerCase() ?? "pass") as OutputDecision;
  const severity = (rule.severity?.toLowerCase() ?? "medium") as Severity;
  const colors = DECISION_COLORS[decision] ?? DECISION_COLORS.pass;
  const scopeStyle = SCOPE_BADGES[scope] ?? SCOPE_BADGES.global;

  return (
    <div
      className={cn(
        "relative rounded-lg border bg-card overflow-hidden transition-all group",
        dimmed ? "opacity-60 border-border" : "border-border hover:border-border/80",
        rule.enabled === false && "opacity-50",
      )}
    >
      <div className={cn("h-[3px] w-full", colors.accent)} />

      <div className="px-5 pt-4 pb-4">
        {/* Title row */}
        <div className="flex items-start justify-between gap-3 mb-1">
          <div className="flex items-center gap-2 min-w-0">
            <h3 className="text-sm font-semibold font-display text-foreground truncate">
              {rule.name || rule.id}
            </h3>
            <span className={cn("inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase", colors.badge)}>
              {decision}
            </span>
            <span className={cn("inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono", scopeStyle.bg, scopeStyle.text)}>
              {scope === "workflow" && scopeLabel ? `Workflow: ${scopeLabel}` : scope === "inherited" ? "Inherited" : "Global"}
            </span>
            <span className={cn("text-[10px] font-mono font-bold uppercase", SEVERITY_COLORS[severity])}>
              {severity}
            </span>
          </div>
          {rule.enabled === false && (
            <span className="text-[10px] font-mono text-muted-foreground bg-surface-2 px-1.5 py-0.5 rounded">
              DISABLED
            </span>
          )}
        </div>

        {/* Description */}
        {rule.description && (
          <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
            {rule.description}
          </p>
        )}

        {/* Match section */}
        <div className="rounded-md bg-surface-0 border border-border p-3 mb-2.5">
          <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-2">Match</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
            {rule.topics && rule.topics.length > 0 && (
              <span className="text-foreground">
                <span className="text-muted-foreground">Topics:</span> {rule.topics.join(", ")}
              </span>
            )}
            {rule.scanners && rule.scanners.length > 0 && (
              <span className="text-foreground">
                <span className="text-muted-foreground">Scanners:</span> {rule.scanners.join(", ")}
              </span>
            )}
            {rule.confidence_threshold != null && (
              <span className="text-foreground">
                <span className="text-muted-foreground">Confidence:</span> ≥ {rule.confidence_threshold}
              </span>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-3 text-[10px] font-mono text-muted-foreground">
            {rule.triggered_7d != null && <span>Last 7d: {rule.triggered_7d} triggered</span>}
            {rule.false_positives_7d != null && (
              <span>
                {rule.false_positives_7d} false positives
                {rule.triggered_7d ? ` (${Math.round((rule.false_positives_7d / rule.triggered_7d) * 100)}%)` : ""}
              </span>
            )}
          </div>

          {!dimmed && (
            <div className="flex items-center gap-1">
              {onEdit && (
                <button onClick={onEdit} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-colors" title="Edit">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              )}
              {onTest && (
                <button onClick={onTest} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-colors" title="Test">
                  <FlaskConical className="w-3.5 h-3.5" />
                </button>
              )}
              <div className="relative">
                <button
                  onClick={() => setMoreOpen(!moreOpen)}
                  className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-colors"
                >
                  <MoreHorizontal className="w-3.5 h-3.5" />
                </button>
                <AnimatePresence>
                  {moreOpen && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className="absolute right-0 top-full mt-1 z-50 min-w-[160px] rounded-lg border border-border bg-surface-1 shadow-xl py-1"
                    >
                      {onDuplicate && (
                        <button onClick={() => { onDuplicate(); setMoreOpen(false); }} className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-surface-2">
                          <Copy className="w-3 h-3" /> Duplicate
                        </button>
                      )}
                      {onToggle && (
                        <button onClick={() => { onToggle(); setMoreOpen(false); }} className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-surface-2">
                          <Power className="w-3 h-3" /> {rule.enabled !== false ? "Disable" : "Enable"}
                        </button>
                      )}
                      {onViewHistory && (
                        <button onClick={() => { onViewHistory(); setMoreOpen(false); }} className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-surface-2">
                          <History className="w-3 h-3" /> View History
                        </button>
                      )}
                      {onDelete && (
                        <>
                          <div className="border-t border-border my-1" />
                          <button onClick={() => { onDelete(); setMoreOpen(false); }} className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10">
                            <Trash2 className="w-3 h-3" /> Delete
                          </button>
                        </>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
