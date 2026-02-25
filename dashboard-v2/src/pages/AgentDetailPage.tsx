/*
 * DESIGN: "Control Surface" — Agent Detail
 * OPERATE / Agents / :id
 * Agent-specific view: metrics, safety breakdown, policy bindings, recent jobs
 */
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import {
  Cpu, Activity, Shield, Clock, ArrowLeft, RefreshCw,
  Zap, AlertTriangle, CheckCircle2, XCircle, Eye,
  BarChart3, TrendingUp,
} from "lucide-react";
import { cn, formatRelativeTime } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
import {
  BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";
import { toast } from "sonner";

/* Mock data — in production from GET /api/v1/agents/:id or reconstructed from jobs */
const mockAgent = {
  id: "agent-alpha-001",
  name: "Alpha Agent",
  pool: "default",
  status: "idle",
  capabilities: ["code-review", "summarize", "data-analysis"],
  version: "1.4.2",
  uptime: 86400000,
  lastHeartbeat: new Date(Date.now() - 5000).toISOString(),
  cpuLoad: 34,
  memoryLoad: 62,
  gpuUtilization: 0,
  metadata: { framework: "langchain", model: "gpt-4o", environment: "production" },
  requires: ["python-3.11", "numpy"],
  labels: { team: "engineering", tier: "production" },
};

const safetyBreakdown = {
  allow: 1842,
  deny: 23,
  require_approval: 45,
  allow_with_constraints: 89,
  throttle: 7,
};

const policyBindings = [
  { bundle_id: "default/global", rule_count: 5, last_eval: new Date(Date.now() - 30000).toISOString() },
  { bundle_id: "secops/workflows", rule_count: 12, last_eval: new Date(Date.now() - 120000).toISOString() },
  { bundle_id: "compliance/pii", rule_count: 6, last_eval: new Date(Date.now() - 600000).toISOString() },
];

const recentJobs = [
  { id: "job-a1", topic: "code-review", status: "succeeded", safety: "allow", duration: "2.1s", time: new Date(Date.now() - 60000).toISOString() },
  { id: "job-a2", topic: "data-analysis", status: "running", safety: "allow_with_constraints", duration: "running...", time: new Date(Date.now() - 120000).toISOString() },
  { id: "job-a3", topic: "external-api-call", status: "failed", safety: "deny", duration: "0s", time: new Date(Date.now() - 300000).toISOString() },
  { id: "job-a4", topic: "summarize", status: "succeeded", safety: "allow", duration: "0.8s", time: new Date(Date.now() - 600000).toISOString() },
  { id: "job-a5", topic: "financial-report", status: "succeeded", safety: "require_approval", duration: "12.4s", time: new Date(Date.now() - 900000).toISOString() },
];

const hourlyActivity = Array.from({ length: 24 }, (_, i) => ({
  hour: `${String(i).padStart(2, "0")}:00`,
  jobs: Math.floor(Math.random() * 80 + 20),
  denied: Math.floor(Math.random() * 4),
}));

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-surface-2 border border-border rounded-lg p-2 shadow-xl">
      <p className="font-mono text-[10px] text-muted-foreground mb-1">{label}</p>
      {payload.map((entry: any, i: number) => (
        <div key={i} className="flex items-center gap-2 text-[10px]">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-muted-foreground">{entry.name}:</span>
          <span className="font-mono text-foreground">{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

function SafetyBadge({ decision }: { decision: string }) {
  const config: Record<string, { color: string; bg: string; label: string }> = {
    allow: { color: "text-emerald-400", bg: "bg-emerald-400/10", label: "ALLOW" },
    deny: { color: "text-red-400", bg: "bg-red-400/10", label: "DENY" },
    require_approval: { color: "text-amber-400", bg: "bg-amber-400/10", label: "APPROVAL" },
    allow_with_constraints: { color: "text-blue-400", bg: "bg-blue-400/10", label: "CONSTRAINED" },
    throttle: { color: "text-orange-400", bg: "bg-orange-400/10", label: "THROTTLE" },
  };
  const c = config[decision] ?? { color: "text-muted-foreground", bg: "bg-surface-2", label: decision.toUpperCase() };
  return <span className={cn("px-1.5 py-0.5 rounded font-mono text-[10px] font-semibold", c.color, c.bg)}>{c.label}</span>;
}

export default function AgentDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const agent = mockAgent;
  const totalDecisions = Object.values(safetyBreakdown).reduce((a, b) => a + b, 0);
  const allowRate = totalDecisions > 0 ? Math.round((safetyBreakdown.allow / totalDecisions) * 100) : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        label="Operate · Agents"
        title={agent.name || id || "Agent Detail"}
        subtitle={`${agent.pool} pool · ${agent.capabilities.join(", ")}`}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate("/agents")}>
              <ArrowLeft className="w-3 h-3 mr-1" />
              Back
            </Button>
            <Button variant="outline" size="sm" onClick={() => toast.info("Feature coming soon")}>
              <RefreshCw className="w-3 h-3 mr-1" />
              Refresh
            </Button>
          </div>
        }
      />

      {/* Agent Status + Metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Agent Info Card */}
        <div className="instrument-card p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className={cn(
              "w-10 h-10 rounded-lg flex items-center justify-center",
              agent.status === "idle" || agent.status === "busy" ? "bg-emerald-400/10" : "bg-red-400/10"
            )}>
              <Cpu className={cn("w-5 h-5", agent.status === "idle" || agent.status === "busy" ? "text-emerald-400" : "text-red-400")} />
            </div>
            <div>
              <p className="font-mono text-sm text-foreground font-medium">{agent.id}</p>
              <StatusBadge variant={agent.status === "idle" || agent.status === "busy" ? "healthy" : "danger"}>
                {agent.status}
              </StatusBadge>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">CPU</span>
              <span className="font-mono text-foreground">{agent.cpuLoad}%</span>
            </div>
            <Progress value={agent.cpuLoad} className="h-1.5" />

            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Memory</span>
              <span className="font-mono text-foreground">{agent.memoryLoad}%</span>
            </div>
            <Progress value={agent.memoryLoad} className="h-1.5" />

            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border">
              <div>
                <p className="text-[10px] text-muted-foreground">Version</p>
                <p className="font-mono text-xs text-foreground">{agent.version}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground">Last Heartbeat</p>
                <p className="font-mono text-xs text-foreground">{formatRelativeTime(agent.lastHeartbeat)}</p>
              </div>
            </div>

            {/* Metadata */}
            <div className="pt-2 border-t border-border space-y-1">
              <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">Metadata</p>
              {Object.entries(agent.metadata).map(([k, v]) => (
                <div key={k} className="flex justify-between text-xs">
                  <span className="text-muted-foreground">{k}</span>
                  <span className="font-mono text-foreground">{String(v)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Safety Breakdown */}
        <div className="instrument-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display font-semibold text-sm text-foreground">Safety Decisions</h3>
            <span className="font-mono text-xs text-muted-foreground">{totalDecisions.toLocaleString()} total</span>
          </div>
          <div className="text-center mb-4">
            <span className="font-mono text-3xl font-bold text-foreground">{allowRate}%</span>
            <span className="text-xs text-muted-foreground ml-2">allow rate</span>
          </div>
          <div className="space-y-2">
            {Object.entries(safetyBreakdown).map(([key, value]) => {
              const pct = totalDecisions > 0 ? (value / totalDecisions) * 100 : 0;
              const colors: Record<string, string> = {
                allow: "bg-emerald-400",
                deny: "bg-red-400",
                require_approval: "bg-amber-400",
                allow_with_constraints: "bg-blue-400",
                throttle: "bg-orange-400",
              };
              return (
                <div key={key}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-muted-foreground capitalize">{key.replace(/_/g, " ")}</span>
                    <span className="font-mono text-foreground">{value.toLocaleString()} ({pct.toFixed(1)}%)</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-surface-2 overflow-hidden">
                    <div className={cn("h-full rounded-full transition-all", colors[key] ?? "bg-gray-400")} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Policy Bindings */}
        <div className="instrument-card p-5">
          <h3 className="font-display font-semibold text-sm text-foreground mb-4">Active Policy Bindings</h3>
          <div className="space-y-3">
            {policyBindings.map((binding) => (
              <div
                key={binding.bundle_id}
                className="rounded-lg border border-border bg-surface-0 p-3 cursor-pointer hover:bg-surface-1 transition-colors"
                onClick={() => navigate(`/policies/bundles`)}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono text-xs text-cordum">{binding.bundle_id}</span>
                  <span className="text-[10px] font-mono text-muted-foreground">{binding.rule_count} rules</span>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Last eval: {formatRelativeTime(binding.last_eval)}
                </p>
              </div>
            ))}
          </div>

          {/* Labels */}
          <div className="mt-4 pt-3 border-t border-border">
            <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-2">Labels</p>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(agent.labels).map(([k, v]) => (
                <span key={k} className="px-2 py-0.5 rounded bg-surface-2 text-[10px] font-mono text-muted-foreground">
                  {k}={v}
                </span>
              ))}
            </div>
          </div>

          {/* Requires */}
          <div className="mt-3 pt-3 border-t border-border">
            <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-2">Requires</p>
            <div className="flex flex-wrap gap-1.5">
              {agent.requires.map((r) => (
                <span key={r} className="px-2 py-0.5 rounded bg-cordum/10 text-[10px] font-mono text-cordum">
                  {r}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Hourly Activity Chart */}
      <div className="instrument-card p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-display font-semibold text-sm text-foreground">Hourly Activity</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Jobs processed per hour (last 24h)</p>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={hourlyActivity}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
            <XAxis dataKey="hour" tick={{ fontSize: 9, fill: "#6B7A90" }} axisLine={false} tickLine={false} interval={3} />
            <YAxis tick={{ fontSize: 9, fill: "#6B7A90" }} axisLine={false} tickLine={false} />
            <Tooltip content={<ChartTooltip />} />
            <Bar dataKey="jobs" fill="#14b8a6" radius={[2, 2, 0, 0]} name="Jobs" />
            <Bar dataKey="denied" fill="#EF4444" radius={[2, 2, 0, 0]} name="Denied" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Recent Jobs */}
      <div className="instrument-card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <h3 className="font-display font-semibold text-sm text-foreground">Recent Jobs</h3>
          <Button variant="ghost" size="sm" onClick={() => navigate("/jobs")}>
            View all <ArrowLeft className="w-3 h-3 ml-1 rotate-180" />
          </Button>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-surface-0">
              <th className="text-left px-5 py-2 text-[10px] font-mono font-medium text-muted-foreground uppercase tracking-widest">Job ID</th>
              <th className="text-left px-5 py-2 text-[10px] font-mono font-medium text-muted-foreground uppercase tracking-widest">Topic</th>
              <th className="text-left px-5 py-2 text-[10px] font-mono font-medium text-muted-foreground uppercase tracking-widest">Status</th>
              <th className="text-left px-5 py-2 text-[10px] font-mono font-medium text-muted-foreground uppercase tracking-widest">Safety</th>
              <th className="text-left px-5 py-2 text-[10px] font-mono font-medium text-muted-foreground uppercase tracking-widest">Duration</th>
              <th className="text-left px-5 py-2 text-[10px] font-mono font-medium text-muted-foreground uppercase tracking-widest">Time</th>
            </tr>
          </thead>
          <tbody>
            {recentJobs.map((job) => (
              <tr
                key={job.id}
                onClick={() => navigate(`/jobs/${job.id}`)}
                className="border-b border-border hover:bg-surface-1 transition-colors cursor-pointer"
              >
                <td className="px-5 py-2.5 font-mono text-sm text-cordum">{job.id}</td>
                <td className="px-5 py-2.5 text-sm text-foreground">{job.topic}</td>
                <td className="px-5 py-2.5">
                  <StatusBadge variant={job.status === "succeeded" ? "healthy" : job.status === "failed" ? "danger" : "warning"}>
                    {job.status}
                  </StatusBadge>
                </td>
                <td className="px-5 py-2.5">
                  <SafetyBadge decision={job.safety} />
                </td>
                <td className="px-5 py-2.5 text-sm text-muted-foreground font-mono">{job.duration}</td>
                <td className="px-5 py-2.5 text-sm text-muted-foreground">{formatRelativeTime(job.time)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
