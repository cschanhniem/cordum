/*
 * DESIGN: "Control Surface" — Policy History v2
 * Spec: Audit log with diff viewer, scope filter, wrapped in PolicyStudioLayout
 */
import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { PolicyStudioLayout } from "@/components/layout/PolicyStudioLayout";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { SkeletonCard } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  History, ChevronDown, ChevronRight, User, Clock,
  Plus, Edit, Trash2, Shield, AlertTriangle, ToggleRight, ToggleLeft, GitCommit,
} from "lucide-react";
import { cn, formatRelativeTime } from "@/lib/utils";
import { usePolicyAudit } from "@/hooks/usePolicies";

function actionVariant(action: string) {
  const lower = action.toLowerCase();
  if (lower.includes("create") || lower.includes("add") || lower.includes("enabled")) return "healthy" as const;
  if (lower.includes("delete") || lower.includes("remove")) return "danger" as const;
  if (lower.includes("update") || lower.includes("modify") || lower.includes("edit") || lower.includes("disabled")) return "warning" as const;
  if (lower.includes("publish") || lower.includes("deploy")) return "info" as const;
  return "muted" as const;
}

function actionIcon(action: string) {
  const lower = action.toLowerCase();
  if (lower.includes("create") || lower.includes("add")) return <Plus className="w-3 h-3" />;
  if (lower.includes("delete") || lower.includes("remove")) return <Trash2 className="w-3 h-3" />;
  if (lower.includes("update") || lower.includes("modify") || lower.includes("edit")) return <Edit className="w-3 h-3" />;
  if (lower.includes("enabled")) return <ToggleRight className="w-3 h-3" />;
  if (lower.includes("disabled")) return <ToggleLeft className="w-3 h-3" />;
  return <GitCommit className="w-3 h-3" />;
}

type FilterScope = "all" | "input" | "output" | "bundle" | "publish";

export default function PoliciesHistoryPage() {
  const { data: auditData, isLoading, error } = usePolicyAudit();
  const auditEntries = auditData?.items ?? [];
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [scopeFilter, setScopeFilter] = useState<FilterScope>("all");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    let entries = auditEntries;
    if (scopeFilter !== "all") {
      entries = entries.filter((e) => {
        const lower = (e.action ?? "").toLowerCase();
        if (scopeFilter === "input") return lower.includes("rule") || lower.includes("input");
        if (scopeFilter === "output") return lower.includes("output") || lower.includes("scanner");
        if (scopeFilter === "bundle") return lower.includes("bundle");
        if (scopeFilter === "publish") return lower.includes("publish") || lower.includes("deploy") || lower.includes("snapshot");
        return true;
      });
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      entries = entries.filter((e) =>
        (e.action ?? "").toLowerCase().includes(q) ||
        (e.resourceName ?? "").toLowerCase().includes(q) ||
        (e.bundleId ?? "").toLowerCase().includes(q) ||
        (e.actor ?? "").toLowerCase().includes(q),
      );
    }
    return entries;
  }, [auditEntries, scopeFilter, search]);

  return (
    <PolicyStudioLayout>
      <div className="space-y-6">
        {/* Toolbar */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-1 bg-surface-1 rounded-lg p-0.5 border border-border">
            {(["all", "input", "output", "bundle", "publish"] as FilterScope[]).map((s) => (
              <button key={s} onClick={() => setScopeFilter(s)}
                className={cn("px-3 py-1.5 text-xs font-mono rounded-md transition-all capitalize",
                  scopeFilter === s ? "bg-cordum/15 text-cordum font-medium" : "text-muted-foreground hover:text-foreground")}>
                {s}
              </button>
            ))}
          </div>
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search history…"
            className="h-8 w-64 px-3 text-xs font-mono bg-surface-1 border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-cordum" />
        </div>

        {isLoading ? (
          <div className="space-y-3">{[1, 2, 3].map((i) => <SkeletonCard key={i} />)}</div>
        ) : error ? (
          <div className="instrument-card p-8 text-center">
            <AlertTriangle className="w-8 h-8 text-red-400 mx-auto mb-3" />
            <p className="text-sm text-foreground font-medium">Failed to load history</p>
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={<History className="w-8 h-8" />} title="No history entries" description="Policy changes will appear here as they are made." />
        ) : (
          <div className="instrument-card p-0 overflow-hidden">
            <div className="px-4 py-3 bg-surface-0 border-b border-border">
              <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                {filtered.length} entr{filtered.length === 1 ? "y" : "ies"}
              </p>
            </div>
            <div className="divide-y divide-border">
              {filtered.map((entry) => {
                const isExpanded = expandedId === entry.id;
                return (
                  <div key={entry.id}>
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                      className="w-full flex items-center gap-4 px-4 py-3 hover:bg-surface-1/50 transition-colors text-left"
                    >
                      <div className="w-4 h-4 flex items-center justify-center shrink-0">
                        {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
                      </div>
                      <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center shrink-0",
                        actionVariant(entry.action) === "healthy" ? "bg-emerald-400/15 text-emerald-400" :
                        actionVariant(entry.action) === "danger" ? "bg-red-400/15 text-red-400" :
                        actionVariant(entry.action) === "warning" ? "bg-amber-400/15 text-amber-400" :
                        "bg-blue-400/15 text-blue-400")}>
                        {actionIcon(entry.action)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-foreground">{entry.action}</span>
                          <StatusBadge variant={actionVariant(entry.action)}>{entry.bundleId ? "bundle" : "policy"}</StatusBadge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          {entry.resourceName ?? entry.bundleId ?? "\u2014"}
                        </p>
                      </div>
                      <div className="flex items-center gap-4 shrink-0">
                        {entry.actor && (
                          <span className="text-[10px] font-mono text-muted-foreground flex items-center gap-1">
                            <User className="w-3 h-3" />{entry.actor}
                          </span>
                        )}
                        <span className="text-[10px] font-mono text-muted-foreground flex items-center gap-1">
                          <Clock className="w-3 h-3" />{formatRelativeTime(entry.timestamp)}
                        </span>
                      </div>
                    </button>
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }}>
                          <div className="px-4 pb-4 pl-16 space-y-3">
                            <div className="bg-surface-0 rounded-lg border border-border overflow-hidden">
                              <div className="px-3 py-2 border-b border-border bg-surface-1/50">
                                <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Change Details</p>
                              </div>
                              <div className="p-3">
                                {entry.details ? (
                                  <pre className="text-xs font-mono text-foreground whitespace-pre-wrap">{typeof entry.details === "string" ? entry.details : JSON.stringify(entry.details, null, 2)}</pre>
                                ) : (
                                  <p className="text-xs text-muted-foreground">No diff available for this change</p>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-4 text-[10px] font-mono text-muted-foreground">
                              <span>ID: {entry.id}</span>
                              {entry.bundleId && <span>Bundle: {entry.bundleId}</span>}
                              <span>Time: {new Date(entry.timestamp).toLocaleString()}</span>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </PolicyStudioLayout>
  );
}
