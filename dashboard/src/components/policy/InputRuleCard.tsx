/*
 * InputRuleCard — Instrument card for an input policy rule.
 * Accent color by decision. Scope badge. Match/Constraints sections.
 */
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Shield,
  ChevronDown,
  ChevronUp,
  Pencil,
  FlaskConical,
  HelpCircle,
  MoreHorizontal,
  Copy,
  Power,
  Trash2,
  History,
  ArrowRightLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { PolicyRule } from "@/api/types";

type DecisionType = "allow" | "deny" | "require_approval" | "allow_with_constraints" | "throttle";

const DECISION_COLORS: Record<string, { accent: string; badge: string; text: string; border: string }> = {
  allow:                  { accent: "bg-emerald-500", badge: "bg-emerald-500/15 text-emerald-400", text: "text-emerald-400", border: "border-emerald-500/20" },
  deny:                   { accent: "bg-red-500",     badge: "bg-red-500/15 text-red-400",         text: "text-red-400",     border: "border-red-500/20" },
  require_approval:       { accent: "bg-amber-500",   badge: "bg-amber-500/15 text-amber-400",     text: "text-amber-400",   border: "border-amber-500/20" },
  allow_with_constraints: { accent: "bg-blue-500",    badge: "bg-blue-500/15 text-blue-400",       text: "text-blue-400",    border: "border-blue-500/20" },
  throttle:               { accent: "bg-amber-500",   badge: "bg-amber-500/15 text-amber-400",     text: "text-amber-400",   border: "border-amber-500/20" },
};

const SCOPE_BADGES: Record<string, { bg: string; text: string }> = {
  global:    { bg: "bg-cordum/15", text: "text-cordum" },
  workflow:  { bg: "bg-blue-500/15", text: "text-blue-400" },
  inherited: { bg: "bg-surface-2", text: "text-muted-foreground" },
  tenant:    { bg: "bg-purple-500/15", text: "text-purple-400" },
};

interface InputRuleCardProps {
  rule: PolicyRule;
  scope?: "global" | "workflow" | "inherited" | "tenant";
  scopeLabel?: string; // e.g. "fraud-pipeline" for workflow scope
  bundleName?: string;
  matchCount24h?: number;
  lastMatch?: string;
  dimmed?: boolean;
  onEdit?: () => void;
  onSimulate?: () => void;
  onExplain?: () => void;
  onDuplicate?: () => void;
  onToggle?: () => void;
  onDelete?: () => void;
  onViewHistory?: () => void;
  onMoveToBundle?: () => void;
}

export function InputRuleCard({
  rule,
  scope = "global",
  scopeLabel,
  bundleName,
  matchCount24h,
  lastMatch,
  dimmed = false,
  onEdit,
  onSimulate,
  onExplain,
  onDuplicate,
  onToggle,
  onDelete,
  onViewHistory,
  onMoveToBundle,
}: InputRuleCardProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const decision = (rule.decision?.toLowerCase() ?? "allow") as DecisionType;
  const colors = DECISION_COLORS[decision] ?? DECISION_COLORS.allow;
  const scopeStyle = SCOPE_BADGES[scope] ?? SCOPE_BADGES.global;

  const hasConstraints = decision === "allow_with_constraints" && rule.constraints;
  const match = rule.match;
  const hasMatch = match && (
    match.topics?.length || match.tenants?.length || match.risk_tags?.length ||
    match.capabilities?.length || match.actor_ids?.length || match.actor_types?.length ||
    match.requires?.length || match.pack_ids?.length || match.labels || match.mcp
  );

  return (
    <div
      className={cn(
        "relative rounded-lg border bg-card overflow-hidden transition-all group",
        dimmed ? "opacity-60 border-border" : "border-border hover:border-border/80",
        !rule.enabled && "opacity-50",
      )}
    >
      {/* Accent bar */}
      <div className={cn("h-[3px] w-full", colors.accent)} />

      <div className="px-5 pt-4 pb-4">
        {/* Title row */}
        <div className="flex items-start justify-between gap-3 mb-1">
          <div className="flex items-center gap-2 min-w-0">
            <h3 className="text-sm font-semibold font-display text-foreground truncate">
              {rule.name || rule.id}
            </h3>
            <span className={cn("inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase", colors.badge)}>
              {decision.replace(/_/g, " ")}
            </span>
            <span className={cn("inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono", scopeStyle.bg, scopeStyle.text)}>
              {scope === "workflow" && scopeLabel ? `Workflow: ${scopeLabel}` : scope === "inherited" ? "Inherited" : scope.charAt(0).toUpperCase() + scope.slice(1)}
            </span>
          </div>
          {!rule.enabled && (
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
        {hasMatch && (
          <div className="rounded-md bg-surface-0 border border-border p-3 mb-2.5">
            <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-2">Match</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
              {match!.topics && match!.topics.length > 0 && (
                <span className="text-foreground">
                  <span className="text-muted-foreground">Topics:</span> {match!.topics.join(", ")}
                </span>
              )}
              {match!.tenants && match!.tenants.length > 0 && (
                <span className="text-foreground">
                  <span className="text-muted-foreground">Tenants:</span> {match!.tenants.join(", ")}
                </span>
              )}
              {match!.risk_tags && match!.risk_tags.length > 0 && (
                <span className="text-foreground">
                  <span className="text-muted-foreground">Risk Tags:</span> {match!.risk_tags.join(", ")}
                </span>
              )}
              {match!.capabilities && match!.capabilities.length > 0 && (
                <span className="text-foreground">
                  <span className="text-muted-foreground">Capabilities:</span> {match!.capabilities.join(", ")}
                </span>
              )}
              {match!.actor_ids && match!.actor_ids.length > 0 && (
                <span className="text-foreground">
                  <span className="text-muted-foreground">Actor IDs:</span> {match!.actor_ids.join(", ")}
                </span>
              )}
              {match!.actor_types && match!.actor_types.length > 0 && (
                <span className="text-foreground">
                  <span className="text-muted-foreground">Actor Types:</span> {match!.actor_types.join(", ")}
                </span>
              )}
              {match!.mcp && (
                <span className="text-foreground">
                  <span className="text-muted-foreground">MCP:</span>{" "}
                  {match!.mcp.deny_tools?.length ? `deny_tools=[${match!.mcp.deny_tools.join(",")}]` : ""}
                  {match!.mcp.allow_servers?.length ? ` allow_servers=[${match!.mcp.allow_servers.join(",")}]` : ""}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Constraints section (only for allow_with_constraints) */}
        {hasConstraints && rule.constraints && (
          <div className="rounded-md bg-surface-0 border border-border p-3 mb-2.5">
            <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-2">Constraints</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
              {rule.constraints.sandbox?.isolated && (
                <span className="text-foreground">
                  <span className="text-muted-foreground">Sandbox:</span> isolated
                </span>
              )}
              {rule.constraints.sandbox?.network_allowlist && rule.constraints.sandbox.network_allowlist.length > 0 && (
                <span className="text-foreground">
                  <span className="text-muted-foreground">Network:</span> {rule.constraints.sandbox.network_allowlist.join(", ")}
                </span>
              )}
              {rule.constraints.budgets?.max_runtime_ms && (
                <span className="text-foreground">
                  <span className="text-muted-foreground">Max Runtime:</span> {rule.constraints.budgets.max_runtime_ms}ms
                </span>
              )}
              {rule.constraints.budgets?.max_retries && (
                <span className="text-foreground">
                  <span className="text-muted-foreground">Max Retries:</span> {rule.constraints.budgets.max_retries}
                </span>
              )}
              {rule.constraints.toolchain?.allowed_tools && rule.constraints.toolchain.allowed_tools.length > 0 && (
                <span className="text-foreground">
                  <span className="text-muted-foreground">Allowed Tools:</span> {rule.constraints.toolchain.allowed_tools.join(", ")}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Footer: bundle, priority, stats, actions */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-3 text-[10px] font-mono text-muted-foreground">
            {bundleName && <span>Bundle: {bundleName}</span>}
            {rule.priority != null && <span>Priority: {rule.priority}</span>}
            {matchCount24h != null && <span>Matches (24h): {matchCount24h}</span>}
            {lastMatch && <span>Last: {lastMatch}</span>}
          </div>

          {!dimmed && (
            <div className="flex items-center gap-1">
              {onEdit && (
                <button onClick={onEdit} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-colors" title="Edit">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              )}
              {onSimulate && (
                <button onClick={onSimulate} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-colors" title="Simulate">
                  <FlaskConical className="w-3.5 h-3.5" />
                </button>
              )}
              {onExplain && (
                <button onClick={onExplain} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-colors" title="Explain">
                  <HelpCircle className="w-3.5 h-3.5" />
                </button>
              )}

              {/* More menu */}
              <div className="relative">
                <button
                  onClick={() => setMoreOpen(!moreOpen)}
                  className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-colors"
                  title="More"
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
                          <Power className="w-3 h-3" /> {rule.enabled ? "Disable" : "Enable"}
                        </button>
                      )}
                      {onViewHistory && (
                        <button onClick={() => { onViewHistory(); setMoreOpen(false); }} className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-surface-2">
                          <History className="w-3 h-3" /> View History
                        </button>
                      )}
                      {onMoveToBundle && scope === "global" && (
                        <button onClick={() => { onMoveToBundle(); setMoreOpen(false); }} className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-surface-2">
                          <ArrowRightLeft className="w-3 h-3" /> Move to Bundle
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
