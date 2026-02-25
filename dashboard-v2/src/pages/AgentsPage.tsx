/*
 * DESIGN: "Control Surface" — Agent Fleet
 * Matches cordumds-gj5mw4zm.manus.space showcase patterns
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { get } from "@/api/client";
import { mapHeartbeatToWorker, type BackendHeartbeat } from "@/api/transform";
import type { Worker } from "@/api/types";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonCard, SkeletonTable } from "@/components/ui/Skeleton";
import {
  Cpu, Search, RefreshCw, Zap, Filter, X, Shield,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn, formatRelativeTime } from "@/lib/utils";

function workerStatusVariant(status: string) {
  switch (status) {
    case "idle": return "healthy" as const;
    case "busy": return "info" as const;
    case "draining": return "warning" as const;
    case "offline": return "danger" as const;
    default: return "muted" as const;
  }
}

export default function AgentsPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedWorker, setSelectedWorker] = useState<Worker | null>(null);
  const [tab, setTab] = useState<"fleet" | "registry">("fleet");
  const navigate = useNavigate();

  const { data: workers, isLoading, refetch } = useQuery({
    queryKey: ["workers"],
    queryFn: async () => {
      const res = await get<BackendHeartbeat[]>("/workers");
      return (res ?? []).map(mapHeartbeatToWorker).filter((w): w is Worker => !!w);
    },
    refetchInterval: 15_000,
  });

  const allWorkers = workers ?? [];
  const idleCount = allWorkers.filter((w) => w.status === "idle").length;
  const busyCount = allWorkers.filter((w) => w.status === "busy").length;
  const offlineCount = allWorkers.filter((w) => w.status === "offline").length;

  // Sort: offline agents go to the bottom
  const statusOrder: Record<string, number> = { busy: 0, idle: 1, draining: 2, offline: 3 };
  const sorted = [...allWorkers].sort((a, b) => (statusOrder[a.status] ?? 99) - (statusOrder[b.status] ?? 99));

  const filtered = sorted.filter((w) => {
    if (statusFilter !== "all" && w.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        w.id.toLowerCase().includes(q) ||
        (w.pool ?? "").toLowerCase().includes(q) ||
        w.capabilities?.some((t: string) => t.toLowerCase().includes(q))
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <PageHeader
        label="Fleet"
        title="Agent Fleet"
        subtitle="Monitor and manage worker agents across all pools"
        actions={
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="w-3 h-3 mr-1" />
            Refresh
          </Button>
        }
      />

      {/* Tabs */}
      <div className="flex items-center gap-4 border-b border-border">
        <button
          onClick={() => setTab("fleet")}
          className={cn(
            "pb-2 text-sm font-medium border-b-2 transition-colors",
            tab === "fleet" ? "border-cordum text-cordum" : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          Fleet Overview
        </button>
        <button
          onClick={() => setTab("registry")}
          className={cn(
            "pb-2 text-sm font-medium border-b-2 transition-colors",
            tab === "registry" ? "border-cordum text-cordum" : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          Agent Registry
        </button>
      </div>

      {tab === "fleet" && (<>
      {/* KPI Row — showcase style */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="grid grid-cols-2 lg:grid-cols-4 gap-4"
      >
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            <div className="instrument-card p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Total Agents</span>
                <Cpu className="w-4 h-4 text-cordum" />
              </div>
              <span className="font-mono text-2xl font-bold text-foreground">{allWorkers.length}</span>
              <div className="flex gap-1 mt-3">
                {allWorkers.map((w, i) => (
                  <div
                    key={i}
                    className={cn(
                      "w-2 h-2 rounded-full",
                      w.status === "idle" || w.status === "busy" ? "bg-emerald-400" : "bg-gray-500",
                    )}
                  />
                ))}
              </div>
            </div>

            <div className="instrument-card p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Idle</span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 status-pulse" />
              </div>
              <span className="font-mono text-2xl font-bold text-emerald-400">{idleCount}</span>
              <p className="text-xs text-muted-foreground mt-1">Ready for work</p>
            </div>

            <div className="instrument-card p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Busy</span>
                <Zap className="w-4 h-4 text-blue-400" />
              </div>
              <span className="font-mono text-2xl font-bold text-blue-400">{busyCount}</span>
              <p className="text-xs text-muted-foreground mt-1">Processing jobs</p>
            </div>

            <div className={cn("instrument-card p-5", offlineCount > 0 && "status-danger")}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Offline</span>
              </div>
              <span className={cn("font-mono text-2xl font-bold", offlineCount > 0 ? "text-red-400" : "text-foreground")}>{offlineCount}</span>
              <p className="text-xs text-muted-foreground mt-1">Disconnected</p>
            </div>
          </>
        )}
      </motion.div>

      {/* Filters — showcase style */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search agents..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 w-full pl-8 pr-3 text-xs bg-surface-1 border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-cordum"
          />
        </div>
        <div className="flex items-center gap-1 bg-surface-1 border border-border rounded-md p-0.5">
          {["all", "idle", "busy", "offline"].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded transition-colors",
                statusFilter === s
                  ? "bg-cordum/10 text-cordum"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Worker Table — showcase style */}
      {isLoading ? (
        <SkeletonTable rows={6} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Cpu className="w-5 h-5" />}
          title="No agents found"
          description={search ? "Try adjusting your search" : "No agents have connected yet"}
        />
      ) : (
        <div className="instrument-card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-border">
            <h3 className="font-display font-semibold text-sm text-foreground">Worker Pool</h3>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="w-3 h-3 mr-1" />
              Refresh
            </Button>
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-surface-0">
                <th className="text-left px-5 py-3 text-xs font-mono font-medium text-muted-foreground uppercase tracking-wider">Worker</th>
                <th className="text-left px-5 py-3 text-xs font-mono font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="text-left px-5 py-3 text-xs font-mono font-medium text-muted-foreground uppercase tracking-wider">Pool</th>
                <th className="text-left px-5 py-3 text-xs font-mono font-medium text-muted-foreground uppercase tracking-wider">Capabilities</th>
                <th className="text-left px-5 py-3 text-xs font-mono font-medium text-muted-foreground uppercase tracking-wider">Jobs</th>
                <th className="text-left px-5 py-3 text-xs font-mono font-medium text-muted-foreground uppercase tracking-wider">Last Seen</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((w) => (
                <tr
                  key={w.id}
                  onClick={() => setSelectedWorker(w)}
                  className={cn(
                    "border-b border-border hover:bg-surface-1 transition-colors cursor-pointer",
                    w.status === "offline" && "opacity-50"
                  )}
                >
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <Zap className="w-3.5 h-3.5 text-cordum" />
                      <span className="text-sm font-medium text-foreground">{w.id.slice(0, 16)}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <StatusBadge variant={workerStatusVariant(w.status)} dot pulse={w.status === "busy"}>
                      {w.status}
                    </StatusBadge>
                  </td>
                  <td className="px-5 py-3 text-sm text-muted-foreground">{w.pool || "default"}</td>
                  <td className="px-5 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(w.capabilities ?? []).slice(0, 3).map((t: string) => (
                        <span key={t} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-surface-2 text-muted-foreground">
                          {t}
                        </span>
                      ))}
                      {(w.capabilities?.length ?? 0) > 3 && (
                        <span className="text-[10px] text-muted-foreground">+{w.capabilities!.length - 3}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-3 font-mono text-sm text-foreground">{w.activeJobs} / {w.capacity}</td>
                  <td className="px-5 py-3 text-sm text-muted-foreground">
                    {w.lastHeartbeat ? formatRelativeTime(w.lastHeartbeat) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      </>)}

      {tab === "registry" && (
        <AgentRegistryTab />
      )}
    </div>
  );
}

/* --- Agent Registry Tab --- */
const mockRegistry = [
  { agent_id: "agent-alpha-001", name: "Alpha Agent", total_jobs: 1842, safety_breakdown: { allow: 1680, deny: 23, require_approval: 45, allow_with_constraints: 89, throttle: 5 }, active_policy_bindings: ["default/global", "secops/workflows"], last_activity: new Date(Date.now() - 60000).toISOString() },
  { agent_id: "agent-beta-002", name: "Beta Agent", total_jobs: 956, safety_breakdown: { allow: 890, deny: 12, require_approval: 20, allow_with_constraints: 30, throttle: 4 }, active_policy_bindings: ["default/global", "compliance/pii"], last_activity: new Date(Date.now() - 300000).toISOString() },
  { agent_id: "agent-gamma-003", name: "Gamma Agent", total_jobs: 412, safety_breakdown: { allow: 350, deny: 40, require_approval: 10, allow_with_constraints: 10, throttle: 2 }, active_policy_bindings: ["default/global"], last_activity: new Date(Date.now() - 900000).toISOString() },
];

function AgentRegistryTab() {
  const navigate = useNavigate();
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">Agents that have submitted jobs, with their safety decision breakdown and policy bindings.</p>
      <div className="instrument-card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-surface-0">
              <th className="text-left px-5 py-3 text-[10px] font-mono font-medium text-muted-foreground uppercase tracking-widest">Agent</th>
              <th className="text-left px-5 py-3 text-[10px] font-mono font-medium text-muted-foreground uppercase tracking-widest">Total Jobs</th>
              <th className="text-left px-5 py-3 text-[10px] font-mono font-medium text-muted-foreground uppercase tracking-widest">Allow</th>
              <th className="text-left px-5 py-3 text-[10px] font-mono font-medium text-muted-foreground uppercase tracking-widest">Deny</th>
              <th className="text-left px-5 py-3 text-[10px] font-mono font-medium text-muted-foreground uppercase tracking-widest">Approval</th>
              <th className="text-left px-5 py-3 text-[10px] font-mono font-medium text-muted-foreground uppercase tracking-widest">Constrained</th>
              <th className="text-left px-5 py-3 text-[10px] font-mono font-medium text-muted-foreground uppercase tracking-widest">Bindings</th>
              <th className="text-left px-5 py-3 text-[10px] font-mono font-medium text-muted-foreground uppercase tracking-widest">Last Active</th>
            </tr>
          </thead>
          <tbody>
            {mockRegistry.map((a) => (
              <tr
                key={a.agent_id}
                onClick={() => navigate(`/agents/${a.agent_id}`)}
                className="border-b border-border hover:bg-surface-1 transition-colors cursor-pointer"
              >
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2">
                    <Shield className="w-3.5 h-3.5 text-cordum" />
                    <div>
                      <p className="text-sm font-medium text-foreground">{a.name || a.agent_id}</p>
                      <p className="text-[10px] font-mono text-muted-foreground">{a.agent_id}</p>
                    </div>
                  </div>
                </td>
                <td className="px-5 py-3 font-mono text-sm text-foreground">{a.total_jobs.toLocaleString()}</td>
                <td className="px-5 py-3 font-mono text-sm text-emerald-400">{a.safety_breakdown.allow}</td>
                <td className="px-5 py-3 font-mono text-sm text-red-400">{a.safety_breakdown.deny}</td>
                <td className="px-5 py-3 font-mono text-sm text-amber-400">{a.safety_breakdown.require_approval}</td>
                <td className="px-5 py-3 font-mono text-sm text-blue-400">{a.safety_breakdown.allow_with_constraints}</td>
                <td className="px-5 py-3">
                  <div className="flex flex-wrap gap-1">
                    {a.active_policy_bindings?.map((b) => (
                      <span key={b} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cordum/10 text-cordum">{b}</span>
                    ))}
                  </div>
                </td>
                <td className="px-5 py-3 text-sm text-muted-foreground">{a.last_activity ? formatRelativeTime(a.last_activity) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
