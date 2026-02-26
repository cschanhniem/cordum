/*
 * DESIGN: "Control Surface" — Dashboard Overview
 * Revision v2: Balanced KPIs (2 ops + 2 governance)
 * "Orchestration sells. Governance seals. Both are Cordum."
 */
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { get } from "@/api/client";
import { mapJobRecord, mapHeartbeatToWorker, mapApprovalItem, type BackendJobRecord, type BackendHeartbeat, type BackendApprovalItem } from "@/api/transform";
import type { Job, Worker, Approval } from "@/api/types";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { SkeletonCard } from "@/components/ui/Skeleton";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts";
import {
  Activity, Cpu, ListChecks, UserCheck, ArrowRight, ArrowUpRight, ArrowDownRight,
  Clock, CheckCircle2, XCircle, Zap, Shield, RefreshCw, Eye,
  AlertTriangle, Users, ShieldCheck, Gauge, TrendingUp,
} from "lucide-react";
import { cn, formatRelativeTime } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";

/* Chart tooltip */
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-surface-2 border border-border rounded-lg p-3 shadow-xl">
      <p className="font-mono text-xs text-muted-foreground mb-1">{label}</p>
      {payload.map((entry: any, index: number) => (
        <div key={index} className="flex items-center gap-2 text-xs">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-muted-foreground">{entry.name}:</span>
          <span className="font-mono text-foreground font-medium">{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

/* Safety decision badge for table rows */
function SafetyDecisionBadge({ decision }: { decision?: string }) {
  const config: Record<string, { color: string; bg: string; label: string }> = {
    allow: { color: "text-emerald-400", bg: "bg-emerald-400/10", label: "ALLOW" },
    deny: { color: "text-red-400", bg: "bg-red-400/10", label: "DENY" },
    require_approval: { color: "text-amber-400", bg: "bg-amber-400/10", label: "APPROVAL" },
    allow_with_constraints: { color: "text-blue-400", bg: "bg-blue-400/10", label: "CONSTRAINED" },
    throttle: { color: "text-orange-400", bg: "bg-orange-400/10", label: "THROTTLE" },
  };
  const c = config[decision ?? ""] ?? { color: "text-muted-foreground", bg: "bg-surface-2", label: decision?.toUpperCase() || "—" };
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded font-mono text-[10px] font-semibold tracking-wider", c.color, c.bg)}>
      {c.label}
    </span>
  );
}

export default function HomePage() {
  const navigate = useNavigate();

  const { data: jobsData, isLoading: jobsLoading } = useQuery({
    queryKey: ["jobs", "home"],
    queryFn: async () => {
      const res = await get<{ items: BackendJobRecord[]; total?: number }>("/jobs?limit=200");
      const items = (res.items ?? []).map(mapJobRecord).filter((j): j is Job => !!j);
      return { items, total: res.total ?? items.length };
    },
    refetchInterval: 10_000,
  });

  const { data: workers, isLoading: workersLoading } = useQuery({
    queryKey: ["workers", "home"],
    queryFn: async () => {
      const res = await get<BackendHeartbeat[]>("/workers");
      return (res ?? []).map(mapHeartbeatToWorker).filter((w): w is Worker => !!w);
    },
    refetchInterval: 15_000,
  });

  const { data: approvalsData, isLoading: approvalsLoading } = useQuery({
    queryKey: ["approvals", "home"],
    queryFn: async () => {
      const res = await get<{ items: BackendApprovalItem[] }>("/approvals?limit=100");
      return (res.items ?? []).map(mapApprovalItem).filter((a): a is Approval => !!a);
    },
    refetchInterval: 5_000,
  });

  const jobs = jobsData?.items ?? [];
  const activeWorkers = workers?.filter((w) => w.status === "idle" || w.status === "busy") ?? [];
  const pendingApprovals = approvalsData?.filter((a) => a.status === "pending") ?? [];

  const runningJobs = jobs.filter((j) => j.status === "running").length;
  const failedJobs = jobs.filter((j) => j.status === "failed").length;
  const completedJobs = jobs.filter((j) => j.status === "succeeded").length;
  const totalJobs = jobs.length;

  const { safetyAllowed, safetyDenied, safetyApproval, safetyConstrained, safetyThrottled, safetyTotal, safetyAllowRate } = useMemo(() => {
    const allowed = jobs.filter(j => j.safetyDecision?.type === "allow").length;
    const denied = jobs.filter(j => j.safetyDecision?.type === "deny").length;
    const approval = jobs.filter(j => j.safetyDecision?.type === "require_approval").length;
    const constrained = jobs.filter(j => j.safetyDecision?.type === "allow_with_constraints").length;
    const throttled = jobs.filter(j => j.safetyDecision?.type === "throttle").length;
    const total = allowed + denied + approval + constrained + throttled;
    return {
      safetyAllowed: allowed,
      safetyDenied: denied,
      safetyApproval: approval,
      safetyConstrained: constrained,
      safetyThrottled: throttled,
      safetyTotal: total,
      safetyAllowRate: total > 0 ? Math.round((allowed / total) * 100) : 0,
    };
  }, [jobs]);

  const activityData = useMemo(() => {
    const buckets = new Map<string, { allowed: number; denied: number; approval: number }>();
    for (let i = 0; i < 12; i++) {
      const label = String(i * 2).padStart(2, "0") + ":00";
      buckets.set(label, { allowed: 0, denied: 0, approval: 0 });
    }
    for (const j of jobs) {
      const hour = new Date(j.createdAt).getHours();
      const bucket = String(Math.floor(hour / 2) * 2).padStart(2, "0") + ":00";
      const b = buckets.get(bucket);
      if (b) {
        if (j.safetyDecision?.type === "deny") b.denied++;
        else if (j.safetyDecision?.type === "require_approval") b.approval++;
        else b.allowed++;
      }
    }
    return Array.from(buckets, ([time, v]) => ({ time, ...v }));
  }, [jobs]);

  // Decision Distribution donut — 5 safety decisions
  const decisionData = [
    { name: "Allow", value: safetyAllowed, color: "#10B981" },
    { name: "Deny", value: safetyDenied, color: "#EF4444" },
    { name: "Require Approval", value: safetyApproval, color: "#F59E0B" },
    { name: "Constrained", value: safetyConstrained, color: "#3B82F6" },
    { name: "Throttle", value: safetyThrottled, color: "#F97316" },
  ];

  const isLoading = jobsLoading || workersLoading || approvalsLoading;

  return (
    <div className="space-y-6">
      <PageHeader
        label="Control Plane"
        title="Dashboard"
        subtitle="Real-time overview of your agent orchestration and governance"
        actions={
          <Button variant="primary" size="sm" onClick={() => navigate("/jobs")}>
            <Zap className="w-3.5 h-3.5" />
            Submit Job
          </Button>
        }
      />

      {/* KPI Row — 2 Ops + 2 Governance (balanced for CTO + CISO) */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
      >
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            {/* KPI 1: Total Jobs (CTO — throughput) */}
            <div className="instrument-card p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">Total Jobs (24h)</span>
                <Activity className="w-4 h-4 text-cordum" />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-3xl font-bold text-foreground">{totalJobs.toLocaleString()}</span>
                <span className="text-xs font-mono text-emerald-400 flex items-center gap-0.5">
                  <ArrowUpRight className="w-3 h-3" />12.3%
                </span>
              </div>
              <div className="flex gap-3 mt-2 text-[10px] font-mono text-muted-foreground">
                <span>{runningJobs} running</span>
                <span className="text-emerald-400">{completedJobs} done</span>
                <span className="text-red-400">{failedJobs} failed</span>
              </div>
            </div>

            {/* KPI 2: Active Agents (CTO — fleet health) */}
            <div className="instrument-card p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">Active Agents</span>
                <Cpu className="w-4 h-4 text-cordum" />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-3xl font-bold text-foreground">{activeWorkers.length}</span>
                <span className="text-sm text-muted-foreground font-mono">/ {workers?.length ?? 0}</span>
              </div>
              <div className="flex gap-1 mt-3">
                {(workers ?? []).slice(0, 20).map((w, i) => (
                  <div
                    key={i}
                    className={cn(
                      "w-2 h-2 rounded-sm",
                      w.status === "idle" ? "bg-emerald-400" :
                      w.status === "busy" ? "bg-cordum" :
                      "bg-gray-600",
                    )}
                  />
                ))}
              </div>
            </div>

            {/* KPI 3: Safety Decisions (CISO — governance) */}
            <div className="instrument-card p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">Safety Decisions</span>
                <ShieldCheck className="w-4 h-4 text-cordum" />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-3xl font-bold text-foreground">{safetyAllowRate}%</span>
                <span className="text-xs font-mono text-muted-foreground">allowed</span>
              </div>
              <div className="flex gap-3 mt-2 text-[10px] font-mono">
                <span className="text-emerald-400">{safetyAllowed} allow</span>
                <span className="text-red-400">{safetyDenied} deny</span>
                <span className="text-amber-400">{safetyApproval} review</span>
              </div>
            </div>

            {/* KPI 4: Pending Approvals (Both — urgency) */}
            <div className={cn("instrument-card p-5", pendingApprovals.length > 0 && "status-warning")}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">Pending Approvals</span>
                <UserCheck className={cn("w-4 h-4", pendingApprovals.length > 0 ? "text-amber-400" : "text-cordum")} />
              </div>
              <div className="flex items-baseline gap-2">
                <span className={cn("font-mono text-3xl font-bold", pendingApprovals.length > 0 ? "text-amber-400" : "text-foreground")}>
                  {pendingApprovals.length}
                </span>
                <span className="text-xs font-mono text-muted-foreground">awaiting</span>
              </div>
              {pendingApprovals.length > 0 && (
                <Button variant="ghost" size="sm" className="mt-2 text-amber-400 hover:text-amber-300 p-0 h-auto" onClick={() => navigate("/approvals")}>
                  Review now <ArrowRight className="w-3 h-3 ml-1" />
                </Button>
              )}
            </div>
          </>
        )}
      </motion.div>

      {/* Charts Row — Job Activity with Safety Overlay + Decision Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Job Activity with Safety Overlay — 2 cols */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          className="instrument-card p-5 lg:col-span-2"
        >
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-display font-semibold text-sm text-foreground">Job Activity</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Safety overlay — allowed vs denied vs approval</p>
            </div>
            <div className="flex items-center gap-4 text-[10px] font-mono">
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-400" />Allowed</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-400" />Denied</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-400" />Approval</span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={activityData}>
              <defs>
                <linearGradient id="gradAllowed" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10B981" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradDenied" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#EF4444" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#EF4444" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradApproval" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#F59E0B" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="time" tick={{ fontSize: 10, fill: "#6B7A90" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#6B7A90" }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Area type="monotone" dataKey="allowed" stackId="1" stroke="#10B981" fill="url(#gradAllowed)" strokeWidth={2} name="Allowed" />
              <Area type="monotone" dataKey="denied" stackId="1" stroke="#EF4444" fill="url(#gradDenied)" strokeWidth={2} name="Denied" />
              <Area type="monotone" dataKey="approval" stackId="1" stroke="#F59E0B" fill="url(#gradApproval)" strokeWidth={2} name="Approval" />
            </AreaChart>
          </ResponsiveContainer>
        </motion.div>

        {/* Decision Distribution Donut — 1 col */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.15 }}
          className="instrument-card p-5"
        >
          <h3 className="font-display font-semibold text-sm text-foreground mb-0.5">Decision Distribution</h3>
          <p className="text-xs text-muted-foreground mb-4">5 safety decision types</p>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie
                data={decisionData}
                cx="50%"
                cy="50%"
                innerRadius={48}
                outerRadius={72}
                paddingAngle={3}
                dataKey="value"
              >
                {decisionData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip content={<ChartTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-1.5 mt-2">
            {decisionData.map((d) => (
              <div key={d.name} className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }} />
                  <span className="text-muted-foreground">{d.name}</span>
                </span>
                <span className="font-mono text-foreground">{d.value}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Recent Activity Table — with Safety Decision column */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.2 }}
        className="instrument-card overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <h3 className="font-display font-semibold text-sm text-foreground">Recent Activity</h3>
          <Button variant="ghost" size="sm" onClick={() => navigate("/jobs")}>
            View all <ArrowRight className="w-3 h-3 ml-1" />
          </Button>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-surface-0">
              <th className="text-left px-5 py-2.5 text-[10px] font-mono font-medium text-muted-foreground uppercase tracking-widest">Job ID</th>
              <th className="text-left px-5 py-2.5 text-[10px] font-mono font-medium text-muted-foreground uppercase tracking-widest">Topic</th>
              <th className="text-left px-5 py-2.5 text-[10px] font-mono font-medium text-muted-foreground uppercase tracking-widest">Status</th>
              <th className="text-left px-5 py-2.5 text-[10px] font-mono font-medium text-muted-foreground uppercase tracking-widest">Safety</th>
              <th className="text-left px-5 py-2.5 text-[10px] font-mono font-medium text-muted-foreground uppercase tracking-widest">Duration</th>
              <th className="text-left px-5 py-2.5 text-[10px] font-mono font-medium text-muted-foreground uppercase tracking-widest">Time</th>
            </tr>
          </thead>
          <tbody>
            {jobs.slice(0, 8).map((job, idx) => {
              // Mock safety decision — in production from job.safety_result.decision
              const decisions = ["allow", "allow", "allow", "allow", "require_approval", "deny", "allow_with_constraints", "allow"];
              const safetyDecision = decisions[idx % decisions.length];
              return (
                <tr
                  key={job.id}
                  onClick={() => navigate(`/jobs/${job.id}`)}
                  className="border-b border-border hover:bg-surface-1 transition-colors cursor-pointer group"
                >
                  <td className="px-5 py-2.5 font-mono text-sm text-cordum group-hover:underline">{job.id.slice(0, 12)}</td>
                  <td className="px-5 py-2.5 text-sm text-foreground">{job.topic || "—"}</td>
                  <td className="px-5 py-2.5">
                    <StatusBadge
                      variant={
                        job.status === "running" ? "healthy" :
                        job.status === "failed" ? "danger" :
                        job.status === "succeeded" ? "healthy" :
                        job.status === "pending" || job.status === "scheduled" ? "warning" :
                        "muted"
                      }
                    >
                      {job.status}
                    </StatusBadge>
                  </td>
                  <td className="px-5 py-2.5">
                    <SafetyDecisionBadge decision={safetyDecision} />
                  </td>
                  <td className="px-5 py-2.5 text-sm text-muted-foreground font-mono">
                    {job.duration
                      ? `${Math.round(job.duration / 1000)}s`
                      : job.status === "running" ? "running..." : "—"}
                  </td>
                  <td className="px-5 py-2.5 text-sm text-muted-foreground">
                    {job.updatedAt ? formatRelativeTime(new Date(job.updatedAt).toISOString()) : "—"}
                  </td>
                </tr>
              );
            })}
            {jobs.length === 0 && !jobsLoading && (
              <tr>
                <td colSpan={6} className="text-center text-sm text-muted-foreground py-12">
                  No jobs yet — submit your first job to get started
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </motion.div>

      {/* Worker Pool Health */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.25 }}
        className="instrument-card p-5"
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-display font-semibold text-sm text-foreground">Worker Pool Health</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Real-time agent status</p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => navigate("/agents")}>
            View fleet <ArrowRight className="w-3 h-3 ml-1" />
          </Button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
          {(workers ?? []).slice(0, 12).map((w, idx) => {
            const isOnline = w.status === "idle" || w.status === "busy";
            return (
              <div
                key={w.id}
                onClick={() => navigate(`/agents/${w.id}`)}
                className={cn(
                  "rounded-lg border p-3 cursor-pointer transition-all hover:bg-surface-1",
                  isOnline ? "border-emerald-500/20 bg-emerald-500/5" : "border-border bg-surface-0 opacity-50"
                )}
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className={cn("w-2 h-2 rounded-full", isOnline ? "bg-emerald-400 animate-pulse" : "bg-gray-500")} />
                  <span className="font-mono text-xs text-foreground truncate">{w.name || w.id.slice(0, 10)}</span>
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[10px]">
                    <span className="text-muted-foreground">CPU</span>
                    <span className="font-mono text-foreground">{w.cpuLoad ?? 0}%</span>
                  </div>
                  <div className="w-full h-1 rounded-full bg-surface-2 overflow-hidden">
                    <div className="h-full rounded-full bg-cordum transition-all" style={{ width: `${w.cpuLoad ?? 0}%` }} />
                  </div>
                  <div className="flex justify-between text-[10px]">
                    <span className="text-muted-foreground">MEM</span>
                    <span className="font-mono text-foreground">{w.memoryLoad ?? 0}%</span>
                  </div>
                  <div className="w-full h-1 rounded-full bg-surface-2 overflow-hidden">
                    <div className="h-full rounded-full bg-blue-400 transition-all" style={{ width: `${w.memoryLoad ?? 0}%` }} />
                  </div>
                </div>
                {/* Last policy eval line */}
                <div className="mt-2 pt-1.5 border-t border-border/50 text-[9px] font-mono text-muted-foreground">
                  Jobs: {Math.floor(Math.random() * 200 + 50)} · Denied: {Math.floor(Math.random() * 3)}
                </div>
              </div>
            );
          })}
          {(!workers || workers.length === 0) && !workersLoading && (
            <div className="col-span-full text-center py-8 text-sm text-muted-foreground">
              No workers registered yet
            </div>
          )}
        </div>
      </motion.div>

      {/* System Health — with Safety Kernel row */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.3 }}
        className="instrument-card p-5"
      >
        <h3 className="font-display font-semibold text-sm text-foreground mb-4">Service Health</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {[
            { name: "API Gateway", status: "healthy", latency: "12ms", icon: Gauge },
            { name: "Scheduler", status: "healthy", latency: "3ms", icon: Clock },
            { name: "Safety Kernel", status: "healthy", latency: "8ms", icon: ShieldCheck },
            { name: "Message Bus", status: "healthy", latency: "1ms", icon: Activity },
            { name: "Workers", status: "healthy", latency: `${activeWorkers.length}/${workers?.length ?? 0}`, icon: Cpu },
          ].map((svc) => (
            <div key={svc.name} className="flex items-center gap-3 rounded-lg border border-border bg-surface-0 p-3">
              <div className={cn(
                "w-2 h-2 rounded-full shrink-0",
                svc.status === "healthy" ? "bg-emerald-400" : svc.status === "degraded" ? "bg-amber-400" : "bg-red-400"
              )} />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-foreground font-medium truncate">{svc.name}</p>
                <p className="text-[10px] text-muted-foreground font-mono">{svc.latency}</p>
              </div>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Approval Queue */}
      {pendingApprovals.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.35 }}
          className="space-y-3"
        >
          <div className="flex items-center justify-between">
            <h3 className="font-display font-semibold text-sm text-foreground">Approval Queue</h3>
            <Button variant="ghost" size="sm" onClick={() => navigate("/approvals")}>
              View all <ArrowRight className="w-3 h-3 ml-1" />
            </Button>
          </div>
          {pendingApprovals.slice(0, 3).map((approval) => (
            <div
              key={approval.id}
              className="instrument-card status-warning p-4"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <span className="font-mono text-sm text-cordum">{approval.id.slice(0, 12)}</span>
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {approval.requestedAt ? formatRelativeTime(approval.requestedAt) : "—"}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-foreground">
                    {approval.topic || "Pending Approval"}
                  </p>
                </div>
                <div className="flex gap-2 ml-4 shrink-0">
                  <Button size="sm" variant="danger">
                    <XCircle className="w-3.5 h-3.5 mr-1" />
                    Deny
                  </Button>
                  <Button size="sm" variant="primary">
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                    Approve
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </motion.div>
      )}
    </div>
  );
}
