/*
 * DESIGN: "Control Surface" — Policy Publish
 * GOVERN / Policy Studio / Publish
 * Deployment control: publish, rollback, diff, history
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import {
  GitBranch, Check, AlertTriangle, Clock, ArrowRight,
  RotateCcw, Shield, Layers, Plus, Minus, Edit3,
  ChevronRight, Lock,
} from "lucide-react";
import { cn, formatRelativeTime } from "@/lib/utils";
import { toast } from "sonner";

/* Mock data — in production from various /policy/* endpoints */
const currentState = {
  version: 4,
  published_at: new Date(Date.now() - 86400000).toISOString(),
  published_by: "admin@cordum.io",
  bundle_count: 3,
  rule_count: 23,
  status: "healthy" as const,
};

const pendingChanges = {
  added: 3,
  removed: 1,
  modified: 2,
  details: [
    { type: "added" as const, bundle: "mcp/tool-restrictions", rule: "deny-external-mcp-servers", description: "Block external MCP server connections" },
    { type: "added" as const, bundle: "mcp/tool-restrictions", rule: "limit-tool-calls", description: "Rate limit MCP tool invocations" },
    { type: "added" as const, bundle: "compliance/pii", rule: "redact-ssn-patterns", description: "Auto-redact SSN patterns in output" },
    { type: "removed" as const, bundle: "default/global", rule: "legacy-allow-all", description: "Remove deprecated catch-all allow rule" },
    { type: "modified" as const, bundle: "secops/workflows", rule: "high-risk-approval", description: "Lower priority from 100 to 50" },
    { type: "modified" as const, bundle: "secops/workflows", rule: "financial-gate", description: "Add budget constraint: max_runtime_ms=30000" },
  ],
};

const publishHistory = [
  { version: 4, action: "publish", at: new Date(Date.now() - 86400000).toISOString(), by: "admin@cordum.io", note: "Added PII protection bundle", bundles: 3, rules: 23 },
  { version: 3, action: "publish", at: new Date(Date.now() - 259200000).toISOString(), by: "security-team", note: "SecOps workflow rules v2", bundles: 2, rules: 17 },
  { version: 2, action: "rollback", at: new Date(Date.now() - 345600000).toISOString(), by: "admin@cordum.io", note: "Rolled back from v3 due to false positives", bundles: 2, rules: 15 },
  { version: 1, action: "publish", at: new Date(Date.now() - 604800000).toISOString(), by: "system", note: "Initial policy setup", bundles: 1, rules: 5 },
];

function DiffBadge({ type }: { type: "added" | "removed" | "modified" }) {
  if (type === "added") return <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-emerald-400/10 text-emerald-400"><Plus className="w-2.5 h-2.5" />ADD</span>;
  if (type === "removed") return <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-red-400/10 text-red-400"><Minus className="w-2.5 h-2.5" />DEL</span>;
  return <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-amber-400/10 text-amber-400"><Edit3 className="w-2.5 h-2.5" />MOD</span>;
}

export default function PoliciesPublishPage() {
  const navigate = useNavigate();
  const [showConfirm, setShowConfirm] = useState(false);
  const [showRollback, setShowRollback] = useState(false);
  const hasPendingChanges = pendingChanges.added + pendingChanges.removed + pendingChanges.modified > 0;

  const handlePublish = () => {
    toast.success("Policy bundle published successfully (v5)");
    setShowConfirm(false);
  };

  const handleRollback = () => {
    toast.success("Rolled back to v3");
    setShowRollback(false);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        label="Govern · Policy Studio"
        title="Publish"
        subtitle="Deploy policy changes to the Safety Kernel"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowRollback(true)}>
              <RotateCcw className="w-3 h-3 mr-1" />
              Rollback
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => setShowConfirm(true)}
              disabled={!hasPendingChanges}
            >
              <GitBranch className="w-3 h-3 mr-1" />
              Publish Changes
            </Button>
          </div>
        }
      />

      {/* Current Published State */}
      <div className="instrument-card p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-3 h-3 rounded-full bg-emerald-400 animate-pulse" />
          <h3 className="font-display font-semibold text-sm text-foreground">Current Published State</h3>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <div>
            <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-1">Version</p>
            <p className="font-mono text-lg font-bold text-foreground">v{currentState.version}</p>
          </div>
          <div>
            <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-1">Published</p>
            <p className="text-sm text-foreground">{formatRelativeTime(currentState.published_at)}</p>
          </div>
          <div>
            <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-1">Publisher</p>
            <p className="text-sm text-foreground font-mono">{currentState.published_by}</p>
          </div>
          <div>
            <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-1">Bundles</p>
            <p className="font-mono text-lg font-bold text-foreground">{currentState.bundle_count}</p>
          </div>
          <div>
            <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-1">Rules</p>
            <p className="font-mono text-lg font-bold text-foreground">{currentState.rule_count}</p>
          </div>
        </div>
      </div>

      {/* Pending Changes */}
      {hasPendingChanges && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="instrument-card status-warning overflow-hidden"
        >
          <div className="px-5 py-4 border-b border-border">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <h3 className="font-display font-semibold text-sm text-foreground">Pending Changes</h3>
              </div>
              <div className="flex items-center gap-4 text-xs font-mono">
                <span className="text-emerald-400">+{pendingChanges.added} added</span>
                <span className="text-red-400">-{pendingChanges.removed} removed</span>
                <span className="text-amber-400">~{pendingChanges.modified} modified</span>
              </div>
            </div>
          </div>
          <div className="divide-y divide-border">
            {pendingChanges.details.map((change, idx) => (
              <div key={idx} className="flex items-center gap-4 px-5 py-3 hover:bg-surface-1 transition-colors">
                <DiffBadge type={change.type} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-mono text-xs text-cordum">{change.bundle}</span>
                    <ChevronRight className="w-3 h-3 text-muted-foreground" />
                    <span className="font-mono text-xs text-foreground">{change.rule}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{change.description}</p>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {!hasPendingChanges && (
        <div className="instrument-card p-8 text-center">
          <Check className="w-8 h-8 text-emerald-400 mx-auto mb-3" />
          <p className="text-sm text-foreground font-medium">All changes are published</p>
          <p className="text-xs text-muted-foreground mt-1">No pending changes to deploy</p>
        </div>
      )}

      {/* Publish History */}
      <div className="instrument-card overflow-hidden">
        <div className="px-5 py-3 border-b border-border">
          <h3 className="font-display font-semibold text-sm text-foreground">Publish History</h3>
        </div>
        <div className="divide-y divide-border">
          {publishHistory.map((entry) => (
            <div key={`${entry.version}-${entry.action}`} className="flex items-center gap-4 px-5 py-3 hover:bg-surface-1 transition-colors">
              <div className={cn(
                "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                entry.action === "publish" ? "bg-emerald-400/10" : "bg-amber-400/10"
              )}>
                {entry.action === "publish" ? (
                  <GitBranch className="w-4 h-4 text-emerald-400" />
                ) : (
                  <RotateCcw className="w-4 h-4 text-amber-400" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-mono text-sm text-foreground font-medium">v{entry.version}</span>
                  <StatusBadge variant={entry.action === "publish" ? "healthy" : "warning"}>
                    {entry.action}
                  </StatusBadge>
                </div>
                <p className="text-xs text-muted-foreground">{entry.note}</p>
              </div>
              <div className="text-right text-xs text-muted-foreground shrink-0">
                <p className="font-mono">{entry.by}</p>
                <p>{formatRelativeTime(entry.at)}</p>
              </div>
              <div className="text-right text-xs text-muted-foreground shrink-0">
                <p className="font-mono">{entry.bundles}B · {entry.rules}R</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Publish Confirmation Dialog */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="instrument-card w-full max-w-md p-6 mx-4"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-cordum/10 flex items-center justify-center">
                <GitBranch className="w-5 h-5 text-cordum" />
              </div>
              <div>
                <h3 className="font-display font-semibold text-foreground">Publish Policy Changes</h3>
                <p className="text-xs text-muted-foreground">v{currentState.version} → v{currentState.version + 1}</p>
              </div>
            </div>
            <div className="bg-surface-0 rounded-lg border border-border p-3 mb-4 text-xs font-mono">
              <p className="text-emerald-400">+{pendingChanges.added} rules added</p>
              <p className="text-red-400">-{pendingChanges.removed} rules removed</p>
              <p className="text-amber-400">~{pendingChanges.modified} rules modified</p>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              This will update the Safety Kernel with the new policy configuration. All running evaluations will use the new rules after publish.
            </p>
            <div className="flex items-center gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setShowConfirm(false)}>Cancel</Button>
              <Button variant="primary" size="sm" onClick={handlePublish}>
                <Check className="w-3 h-3 mr-1" />
                Confirm Publish
              </Button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Rollback Dialog */}
      {showRollback && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="instrument-card w-full max-w-md p-6 mx-4"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-amber-400/10 flex items-center justify-center">
                <RotateCcw className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <h3 className="font-display font-semibold text-foreground">Rollback Policy</h3>
                <p className="text-xs text-muted-foreground">Revert to a previous version</p>
              </div>
            </div>
            <div className="space-y-2 mb-4">
              {publishHistory.filter(e => e.action === "publish").map((entry) => (
                <button
                  key={entry.version}
                  className="w-full flex items-center gap-3 p-3 rounded-lg border border-border bg-surface-0 hover:bg-surface-1 transition-colors text-left"
                  onClick={handleRollback}
                >
                  <span className="font-mono text-sm text-foreground font-medium">v{entry.version}</span>
                  <span className="text-xs text-muted-foreground flex-1">{entry.note}</span>
                  <span className="text-[10px] font-mono text-muted-foreground">{entry.rules}R</span>
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setShowRollback(false)}>Cancel</Button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
