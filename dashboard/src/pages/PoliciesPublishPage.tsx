/*
 * DESIGN: "Control Surface" — Policy Publish
 * GOVERN / Policy Studio / Publish
 * Deployment control: publish, rollback, diff, history
 */
import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { SkeletonCard } from "@/components/ui/Skeleton";
import {
  GitBranch, Check, AlertTriangle,
  RotateCcw, Edit3, Plus,
  ChevronRight,
} from "lucide-react";
import { cn, formatRelativeTime } from "@/lib/utils";
import {
  usePolicyBundles,
  usePolicySnapshots,
  usePublishPolicy,
  useRollbackPolicy,
} from "@/hooks/usePolicies";

function DiffBadge({ type }: { type: "added" | "modified" }) {
  if (type === "added") return <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-emerald-400/10 text-emerald-400"><Plus className="w-2.5 h-2.5" />NEW</span>;
  return <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-amber-400/10 text-amber-400"><Edit3 className="w-2.5 h-2.5" />MOD</span>;
}

export default function PoliciesPublishPage() {
  const navigate = useNavigate();
  const [showConfirm, setShowConfirm] = useState(false);
  const [showRollback, setShowRollback] = useState(false);

  const { data: bundlesData, isLoading: bundlesLoading, error: bundlesError } = usePolicyBundles();
  const bundles = bundlesData?.items ?? [];

  const { data: snapshotsData, isLoading: snapshotsLoading } = usePolicySnapshots();
  const snapshots = snapshotsData?.items ?? [];

  const publishMutation = usePublishPolicy();
  const rollbackMutation = useRollbackPolicy();

  const isLoading = bundlesLoading || snapshotsLoading;

  // Derive current published state from latest snapshot + bundles
  const currentState = useMemo(() => {
    const latestSnapshot = snapshots.length > 0 ? snapshots[0] : null;
    const publishedBundles = bundles.filter(b => b.status === "published");
    return {
      version: latestSnapshot?.version ?? (publishedBundles.length > 0 ? Math.max(...publishedBundles.map(b => b.version ?? 0)) : 0),
      published_at: latestSnapshot?.createdAt ?? "",
      published_by: latestSnapshot?.createdBy ?? "—",
      bundle_count: publishedBundles.length,
      rule_count: publishedBundles.reduce((sum, b) => sum + (b.rule_count ?? 0), 0),
    };
  }, [bundles, snapshots]);

  // Derive pending changes: draft bundles or published bundles modified after last publish
  const pendingChanges = useMemo(() => {
    const draftBundles = bundles.filter(b => b.status === "draft");
    const modifiedBundles = bundles.filter(b => {
      if (b.status !== "published") return false;
      if (!b.updatedAt || !b.publishedAt) return false;
      return new Date(b.updatedAt).getTime() > new Date(b.publishedAt).getTime();
    });

    const details: Array<{ type: "added" | "modified"; bundle: string; description: string }> = [];
    for (const b of draftBundles) {
      details.push({ type: "added", bundle: b.id, description: `New bundle: ${b.name}` });
    }
    for (const b of modifiedBundles) {
      details.push({ type: "modified", bundle: b.id, description: `Modified since last publish` });
    }

    return {
      added: draftBundles.length,
      modified: modifiedBundles.length,
      details,
    };
  }, [bundles]);

  const hasPendingChanges = pendingChanges.added + pendingChanges.modified > 0;

  // Derive publish history from snapshots
  const publishHistory = useMemo(() => {
    return snapshots.map(snap => ({
      id: snap.id,
      version: snap.version ?? 0,
      at: snap.createdAt,
      by: snap.createdBy ?? "—",
      note: snap.note ?? "—",
    }));
  }, [snapshots]);

  const handlePublish = () => {
    publishMutation.mutate(
      { bundleId: "all", note: "Published from dashboard" },
      { onSuccess: () => setShowConfirm(false) },
    );
  };

  const handleRollback = (snapshotId: string) => {
    rollbackMutation.mutate(
      { snapshotId },
      { onSuccess: () => setShowRollback(false) },
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        label="Govern · Policy Studio"
        title="Publish"
        subtitle="Deploy policy changes to the Safety Kernel"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowRollback(true)} disabled={snapshots.length === 0}>
              <RotateCcw className="w-3 h-3 mr-1" />
              Rollback
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => setShowConfirm(true)}
              disabled={!hasPendingChanges || publishMutation.isPending}
            >
              <GitBranch className="w-3 h-3 mr-1" />
              Publish Changes
            </Button>
          </div>
        }
      />

      {/* Current Published State */}
      {isLoading ? (
        <SkeletonCard />
      ) : (
        <div className="instrument-card p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-3 h-3 rounded-full bg-emerald-400 animate-pulse" />
            <h3 className="font-display font-semibold text-sm text-foreground">Current Published State</h3>
          </div>
          {currentState.version === 0 && !currentState.published_at ? (
            <p className="text-xs text-muted-foreground">No published state yet</p>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
              <div>
                <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-1">Version</p>
                <p className="font-mono text-lg font-bold text-foreground">v{currentState.version}</p>
              </div>
              <div>
                <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-1">Published</p>
                <p className="text-sm text-foreground">{currentState.published_at ? formatRelativeTime(currentState.published_at) : "—"}</p>
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
          )}
        </div>
      )}

      {/* Pending Changes */}
      {isLoading ? (
        <SkeletonCard />
      ) : hasPendingChanges ? (
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
                {pendingChanges.added > 0 && <span className="text-emerald-400">+{pendingChanges.added} new</span>}
                {pendingChanges.modified > 0 && <span className="text-amber-400">~{pendingChanges.modified} modified</span>}
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
                  </div>
                  <p className="text-xs text-muted-foreground">{change.description}</p>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      ) : (
        <div className="instrument-card p-8 text-center">
          <Check className="w-8 h-8 text-emerald-400 mx-auto mb-3" />
          <p className="text-sm text-foreground font-medium">All changes are published</p>
          <p className="text-xs text-muted-foreground mt-1">No pending changes to deploy</p>
        </div>
      )}

      {/* Publish History */}
      {isLoading ? (
        <SkeletonCard />
      ) : (
        <div className="instrument-card overflow-hidden">
          <div className="px-5 py-3 border-b border-border">
            <h3 className="font-display font-semibold text-sm text-foreground">Publish History</h3>
          </div>
          {publishHistory.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-xs text-muted-foreground">No publish history available</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {publishHistory.map((entry) => (
                <div key={entry.id} className="flex items-center gap-4 px-5 py-3 hover:bg-surface-1 transition-colors">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-emerald-400/10">
                    <GitBranch className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-mono text-sm text-foreground font-medium">v{entry.version}</span>
                      <StatusBadge variant="healthy">snapshot</StatusBadge>
                    </div>
                    <p className="text-xs text-muted-foreground">{entry.note}</p>
                  </div>
                  <div className="text-right text-xs text-muted-foreground shrink-0">
                    <p className="font-mono">{entry.by}</p>
                    <p>{entry.at ? formatRelativeTime(entry.at) : "—"}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

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
              {pendingChanges.added > 0 && <p className="text-emerald-400">+{pendingChanges.added} bundles added</p>}
              {pendingChanges.modified > 0 && <p className="text-amber-400">~{pendingChanges.modified} bundles modified</p>}
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              This will update the Safety Kernel with the new policy configuration. All running evaluations will use the new rules after publish.
            </p>
            <div className="flex items-center gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setShowConfirm(false)} disabled={publishMutation.isPending}>Cancel</Button>
              <Button variant="primary" size="sm" onClick={handlePublish} disabled={publishMutation.isPending}>
                <Check className="w-3 h-3 mr-1" />
                {publishMutation.isPending ? "Publishing..." : "Confirm Publish"}
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
                <p className="text-xs text-muted-foreground">Revert to a previous snapshot</p>
              </div>
            </div>
            <div className="space-y-2 mb-4">
              {snapshots.map((snap) => (
                <button
                  key={snap.id}
                  className="w-full flex items-center gap-3 p-3 rounded-lg border border-border bg-surface-0 hover:bg-surface-1 transition-colors text-left"
                  onClick={() => handleRollback(snap.id)}
                  disabled={rollbackMutation.isPending}
                >
                  <span className="font-mono text-sm text-foreground font-medium">v{snap.version ?? "?"}</span>
                  <span className="text-xs text-muted-foreground flex-1">{snap.note ?? "—"}</span>
                  <span className="text-[10px] font-mono text-muted-foreground">
                    {snap.createdAt ? formatRelativeTime(snap.createdAt) : "—"}
                  </span>
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setShowRollback(false)} disabled={rollbackMutation.isPending}>
                Cancel
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
