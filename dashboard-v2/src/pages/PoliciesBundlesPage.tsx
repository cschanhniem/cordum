/*
 * DESIGN: "Control Surface" — Policy Bundles
 * GOVERN / Policy Studio / Bundles
 * Bundle management: list, detail, snapshots, simulate, diff
 */
import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { get } from "@/api/client";
import type { PolicyBundle, BundleSnapshot, PolicyRule } from "@/api/types";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonCard } from "@/components/ui/Skeleton";
import {
  Layers, ChevronRight, ChevronDown, Search, RefreshCw,
  Package, Clock, Shield, History, Play, Download,
  Eye, GitBranch, Check, AlertTriangle, Plus, Diff,
} from "lucide-react";
import { cn, formatRelativeTime } from "@/lib/utils";
import { toast } from "sonner";

/* Mock data — in production from GET /api/v1/policy/bundles */
const mockBundles: PolicyBundle[] = [
  {
    id: "secops/workflows",
    bundle_id: "secops/workflows",
    name: "SecOps Workflows",
    version: 4,
    status: "published",
    rules: [],
    rule_count: 12,
    eval_count_24h: 8432,
    last_triggered: new Date(Date.now() - 120000).toISOString(),
    publishedAt: new Date(Date.now() - 86400000).toISOString(),
    published_by: "admin@cordum.io",
    updatedAt: new Date(Date.now() - 3600000).toISOString(),
    healthStatus: "healthy",
  },
  {
    id: "default/global",
    bundle_id: "default/global",
    name: "Global Default",
    version: 7,
    status: "published",
    rules: [],
    rule_count: 5,
    eval_count_24h: 24100,
    last_triggered: new Date(Date.now() - 30000).toISOString(),
    publishedAt: new Date(Date.now() - 172800000).toISOString(),
    published_by: "system",
    updatedAt: new Date(Date.now() - 7200000).toISOString(),
    healthStatus: "healthy",
  },
  {
    id: "mcp/tool-restrictions",
    bundle_id: "mcp/tool-restrictions",
    name: "MCP Tool Restrictions",
    version: 2,
    status: "draft",
    rules: [],
    rule_count: 8,
    eval_count_24h: 0,
    last_triggered: undefined,
    updatedAt: new Date(Date.now() - 1800000).toISOString(),
    healthStatus: "draft",
  },
  {
    id: "compliance/pii",
    bundle_id: "compliance/pii",
    name: "PII Protection",
    version: 3,
    status: "published",
    rules: [],
    rule_count: 6,
    eval_count_24h: 4200,
    last_triggered: new Date(Date.now() - 600000).toISOString(),
    publishedAt: new Date(Date.now() - 259200000).toISOString(),
    published_by: "security-team",
    updatedAt: new Date(Date.now() - 14400000).toISOString(),
    healthStatus: "healthy",
  },
];

const mockSnapshots: BundleSnapshot[] = [
  { snapshot_id: "snap-001", bundle_id: "all", note: "Pre-release v4 snapshot", created_at: new Date(Date.now() - 86400000).toISOString(), created_by: "admin@cordum.io", version: 3, rule_count: 28 },
  { snapshot_id: "snap-002", bundle_id: "all", note: "After PII rule update", created_at: new Date(Date.now() - 172800000).toISOString(), created_by: "security-team", version: 2, rule_count: 25 },
  { snapshot_id: "snap-003", bundle_id: "all", note: "Initial policy setup", created_at: new Date(Date.now() - 604800000).toISOString(), created_by: "system", version: 1, rule_count: 17 },
];

function BundleStatusBadge({ status }: { status?: string }) {
  if (status === "published") return <StatusBadge variant="healthy">Published</StatusBadge>;
  if (status === "draft") return <StatusBadge variant="warning">Draft</StatusBadge>;
  if (status === "archived") return <StatusBadge variant="muted">Archived</StatusBadge>;
  return <StatusBadge variant="muted">{status || "Unknown"}</StatusBadge>;
}

export default function PoliciesBundlesPage() {
  const navigate = useNavigate();
  const [expandedBundle, setExpandedBundle] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"bundles" | "snapshots">("bundles");

  // In production: useQuery for GET /api/v1/policy/bundles
  const bundles = mockBundles;
  const snapshots = mockSnapshots;
  const isLoading = false;

  const filteredBundles = useMemo(() => {
    if (!search) return bundles;
    const q = search.toLowerCase();
    return bundles.filter(b =>
      b.id.toLowerCase().includes(q) ||
      b.name.toLowerCase().includes(q)
    );
  }, [bundles, search]);

  const publishedCount = bundles.filter(b => b.status === "published").length;
  const totalRules = bundles.reduce((sum, b) => sum + (b.rule_count ?? 0), 0);
  const totalEvals = bundles.reduce((sum, b) => sum + (b.eval_count_24h ?? 0), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        label="Govern · Policy Studio"
        title="Policy Bundles"
        subtitle={`${bundles.length} bundles · ${totalRules} rules · ${totalEvals.toLocaleString()} evals/24h`}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate("/policies/publish")}>
              <GitBranch className="w-3 h-3 mr-1" />
              Publish
            </Button>
            <Button variant="primary" size="sm" onClick={() => toast.info("Feature coming soon")}>
              <Plus className="w-3 h-3 mr-1" />
              Create Bundle
            </Button>
          </div>
        }
      />

      {/* Summary KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="instrument-card p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">Published</span>
            <Check className="w-4 h-4 text-emerald-400" />
          </div>
          <span className="font-mono text-2xl font-bold text-foreground">{publishedCount}</span>
          <span className="text-xs text-muted-foreground ml-2">/ {bundles.length} bundles</span>
        </div>
        <div className="instrument-card p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">Total Rules</span>
            <Shield className="w-4 h-4 text-cordum" />
          </div>
          <span className="font-mono text-2xl font-bold text-foreground">{totalRules}</span>
          <span className="text-xs text-muted-foreground ml-2">across all bundles</span>
        </div>
        <div className="instrument-card p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">Evaluations (24h)</span>
            <Play className="w-4 h-4 text-cordum" />
          </div>
          <span className="font-mono text-2xl font-bold text-foreground">{totalEvals.toLocaleString()}</span>
        </div>
      </div>

      {/* Tabs: Bundles / Snapshots */}
      <div className="flex items-center gap-4 border-b border-border">
        <button
          onClick={() => setTab("bundles")}
          className={cn(
            "pb-2 text-sm font-medium border-b-2 transition-colors",
            tab === "bundles" ? "border-cordum text-cordum" : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          <Layers className="w-3.5 h-3.5 inline mr-1.5" />
          Bundles ({bundles.length})
        </button>
        <button
          onClick={() => setTab("snapshots")}
          className={cn(
            "pb-2 text-sm font-medium border-b-2 transition-colors",
            tab === "snapshots" ? "border-cordum text-cordum" : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          <History className="w-3.5 h-3.5 inline mr-1.5" />
          Snapshots ({snapshots.length})
        </button>
      </div>

      {tab === "bundles" && (
        <>
          {/* Search */}
          <div className="relative max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search bundles..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 w-full pl-8 pr-3 text-xs bg-surface-1 border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-cordum"
            />
          </div>

          {/* Bundle list */}
          <div className="space-y-3">
            {filteredBundles.map((bundle) => {
              const isExpanded = expandedBundle === bundle.id;
              return (
                <motion.div
                  key={bundle.id}
                  layout
                  className="instrument-card overflow-hidden"
                >
                  <div
                    className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-surface-1 transition-colors"
                    onClick={() => setExpandedBundle(isExpanded ? null : bundle.id)}
                  >
                    <div className="shrink-0">
                      {isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-1">
                        <span className="font-mono text-sm text-cordum">{bundle.id}</span>
                        <BundleStatusBadge status={bundle.status} />
                        <span className="text-[10px] font-mono text-muted-foreground">v{bundle.version}</span>
                      </div>
                      <p className="text-sm text-foreground font-medium">{bundle.name}</p>
                    </div>
                    <div className="flex items-center gap-6 text-xs text-muted-foreground shrink-0">
                      <div className="text-center">
                        <p className="font-mono text-foreground font-medium">{bundle.rule_count}</p>
                        <p className="text-[10px]">rules</p>
                      </div>
                      <div className="text-center">
                        <p className="font-mono text-foreground font-medium">{(bundle.eval_count_24h ?? 0).toLocaleString()}</p>
                        <p className="text-[10px]">evals/24h</p>
                      </div>
                      <div className="text-center">
                        <p className="font-mono text-foreground font-medium">
                          {bundle.last_triggered ? formatRelativeTime(bundle.last_triggered) : "—"}
                        </p>
                        <p className="text-[10px]">last triggered</p>
                      </div>
                    </div>
                  </div>

                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="border-t border-border bg-surface-0"
                      >
                        <div className="p-5 space-y-4">
                          {/* Bundle metadata */}
                          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
                            <div>
                              <p className="text-muted-foreground mb-1">Published At</p>
                              <p className="font-mono text-foreground">{bundle.publishedAt ? new Date(bundle.publishedAt).toLocaleString() : "Not published"}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground mb-1">Published By</p>
                              <p className="font-mono text-foreground">{bundle.published_by || "—"}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground mb-1">Last Modified</p>
                              <p className="font-mono text-foreground">{bundle.updatedAt ? formatRelativeTime(bundle.updatedAt) : "—"}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground mb-1">Health</p>
                              <StatusBadge variant={bundle.healthStatus === "healthy" ? "healthy" : "warning"}>
                                {bundle.healthStatus || "unknown"}
                              </StatusBadge>
                            </div>
                          </div>

                          {/* Actions */}
                          <div className="flex items-center gap-2">
                            <Button variant="outline" size="sm" onClick={() => navigate(`/policies/rules?bundle=${bundle.id}`)}>
                              <Eye className="w-3 h-3 mr-1" />
                              View Rules
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => toast.info("Feature coming soon")}>
                              <Play className="w-3 h-3 mr-1" />
                              Simulate
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => toast.info("Feature coming soon")}>
                              <Diff className="w-3 h-3 mr-1" />
                              Diff
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => toast.info("Feature coming soon")}>
                              <Download className="w-3 h-3 mr-1" />
                              Export YAML
                            </Button>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </div>
        </>
      )}

      {tab === "snapshots" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Point-in-time snapshots of all policy bundles</p>
            <Button variant="primary" size="sm" onClick={() => toast.info("Feature coming soon")}>
              <Plus className="w-3 h-3 mr-1" />
              Create Snapshot
            </Button>
          </div>
          {snapshots.map((snap) => (
            <div key={snap.snapshot_id} className="instrument-card p-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-surface-2 border border-border flex items-center justify-center shrink-0">
                <History className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-mono text-sm text-cordum">{snap.snapshot_id}</span>
                  <span className="text-[10px] font-mono text-muted-foreground">v{snap.version}</span>
                </div>
                <p className="text-sm text-foreground">{snap.note}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {snap.rule_count} rules · by {snap.created_by} · {formatRelativeTime(snap.created_at)}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button variant="outline" size="sm" onClick={() => toast.info("Feature coming soon")}>
                  <Eye className="w-3 h-3 mr-1" />
                  View
                </Button>
                <Button variant="outline" size="sm" onClick={() => toast.info("Feature coming soon")}>
                  <RefreshCw className="w-3 h-3 mr-1" />
                  Restore
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
