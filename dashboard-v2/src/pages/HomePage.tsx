import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { get } from "@/api/client";
import { mapJobRecord, mapHeartbeatToWorker, mapApprovalItem, type BackendJobRecord, type BackendHeartbeat, type BackendApprovalItem } from "@/api/transform";
import type { Job, Worker, Approval } from "@/api/types";
import { PageHeader } from "@/components/layout/PageHeader";
import { InstrumentCard, InstrumentCardHeader, InstrumentCardBody } from "@/components/ui/InstrumentCard";
import { MetricValue } from "@/components/ui/MetricValue";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { SkeletonCard } from "@/components/ui/Skeleton";
import {
  AreaChart, Area, BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";
import {
  Activity, Cpu, ListChecks, UserCheck, AlertTriangle, Workflow, ArrowRight,
  Clock, CheckCircle2, XCircle, Zap, Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/lib/utils";

// Chart tooltip
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2 shadow-lg">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} className="text-sm font-semibold" style={{ color: p.color }}>
          {p.value}
        </p>
      ))}
    </div>
  );
}

export default function HomePage() {
  const navigate = useNavigate();

  // Fetch jobs
  const { data: jobsData, isLoading: jobsLoading } = useQuery({
    queryKey: ["jobs", "home"],
    queryFn: async () => {
      const res = await get<{ items: BackendJobRecord[]; total?: number }>("/jobs?limit=200");
      const items = (res.items ?? []).map(mapJobRecord).filter((j): j is Job => !!j);
      return { items, total: res.total ?? items.length };
    },
    refetchInterval: 10_000,
  });

  // Fetch workers
  const { data: workers, isLoading: workersLoading } = useQuery({
    queryKey: ["workers", "home"],
    queryFn: async () => {
      const res = await get<BackendHeartbeat[]>("/workers");
      return (res ?? []).map(mapHeartbeatToWorker).filter((w): w is Worker => !!w);
    },
    refetchInterval: 15_000,
  });

  // Fetch approvals
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

  // Compute stats
  const runningJobs = jobs.filter((j) => j.status === "running").length;
  const pendingJobs = jobs.filter((j) => j.status === "pending" || j.status === "scheduled").length;
  const failedJobs = jobs.filter((j) => j.status === "failed").length;
  const completedJobs = jobs.filter((j) => j.status === "succeeded").length;

  // Mock throughput data (would come from /metrics in production)
  const throughputData = Array.from({ length: 24 }, (_, i) => ({
    hour: `${i}:00`,
    jobs: Math.floor(Math.random() * 50 + 10),
    approvals: Math.floor(Math.random() * 15),
  }));

  const isLoading = jobsLoading || workersLoading || approvalsLoading;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        subtitle="Control plane overview"
        actions={
          <Button variant="primary" size="sm" onClick={() => navigate("/jobs")}>
            <Zap className="w-3.5 h-3.5" />
            Submit Job
          </Button>
        }
      />

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            <InstrumentCard accent={runningJobs > 0 ? "healthy" : "muted"}>
              <InstrumentCardBody className="pt-4">
                <MetricValue
                  label="Active Jobs"
                  value={runningJobs}
                  trend={{ value: 12, label: "vs last hour" }}
                />
              </InstrumentCardBody>
            </InstrumentCard>

            <InstrumentCard accent={activeWorkers.length > 0 ? "healthy" : "warning"}>
              <InstrumentCardBody className="pt-4">
                <MetricValue
                  label="Agent Fleet"
                  value={activeWorkers.length}
                  unit={`/ ${workers?.length ?? 0}`}
                />
                <div className="flex gap-2 mt-2">
                  <StatusBadge variant="healthy" dot>
                    {workers?.filter((w) => w.status === "idle").length ?? 0} idle
                  </StatusBadge>
                  <StatusBadge variant="info" dot>
                    {workers?.filter((w) => w.status === "busy").length ?? 0} busy
                  </StatusBadge>
                </div>
              </InstrumentCardBody>
            </InstrumentCard>

            <InstrumentCard accent={pendingApprovals.length > 0 ? "warning" : "healthy"}>
              <InstrumentCardBody className="pt-4">
                <MetricValue
                  label="Pending Approvals"
                  value={pendingApprovals.length}
                />
                {pendingApprovals.length > 0 && (
                  <button
                    onClick={() => navigate("/approvals")}
                    className="flex items-center gap-1 mt-2 text-xs text-cordum hover:text-cordum-light transition-colors"
                  >
                    Review now <ArrowRight className="w-3 h-3" />
                  </button>
                )}
              </InstrumentCardBody>
            </InstrumentCard>

            <InstrumentCard accent={failedJobs > 0 ? "danger" : "healthy"}>
              <InstrumentCardBody className="pt-4">
                <MetricValue
                  label="Failed Jobs"
                  value={failedJobs}
                  trend={failedJobs > 0 ? { value: -8, label: "vs last hour" } : undefined}
                />
                {failedJobs > 0 && (
                  <button
                    onClick={() => navigate("/dlq")}
                    className="flex items-center gap-1 mt-2 text-xs text-status-danger hover:text-status-danger/80 transition-colors"
                  >
                    View DLQ <ArrowRight className="w-3 h-3" />
                  </button>
                )}
              </InstrumentCardBody>
            </InstrumentCard>
          </>
        )}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <InstrumentCard>
          <InstrumentCardHeader
            title="Job Throughput"
            subtitle="Last 24 hours"
            icon={<Activity className="w-4 h-4" />}
          />
          <InstrumentCardBody>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={throughputData}>
                  <defs>
                    <linearGradient id="jobsGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#27b3a8" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#27b3a8" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(229,239,236,0.06)" strokeDasharray="3 3" />
                  <XAxis
                    dataKey="hour"
                    tick={{ fontSize: 10, fill: "#7a8f8c" }}
                    axisLine={{ stroke: "rgba(229,239,236,0.08)" }}
                    tickLine={false}
                    interval={3}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "#7a8f8c" }}
                    axisLine={false}
                    tickLine={false}
                    width={30}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="jobs"
                    stroke="#27b3a8"
                    strokeWidth={2}
                    fill="url(#jobsGrad)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </InstrumentCardBody>
        </InstrumentCard>

        <InstrumentCard>
          <InstrumentCardHeader
            title="Job States"
            subtitle="Current distribution"
            icon={<ListChecks className="w-4 h-4" />}
          />
          <InstrumentCardBody>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={[
                    { state: "Pending", count: pendingJobs, fill: "#d4a03a" },
                    { state: "Running", count: runningJobs, fill: "#27b3a8" },
                    { state: "Completed", count: completedJobs, fill: "#27b3a8" },
                    { state: "Failed", count: failedJobs, fill: "#e05555" },
                  ]}
                  layout="vertical"
                  margin={{ left: 0 }}
                >
                  <CartesianGrid stroke="rgba(229,239,236,0.06)" strokeDasharray="3 3" horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 10, fill: "#7a8f8c" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="state"
                    tick={{ fontSize: 11, fill: "#7a8f8c" }}
                    axisLine={false}
                    tickLine={false}
                    width={75}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={20}>
                    {[
                      { state: "Pending", fill: "#d4a03a" },
                      { state: "Running", fill: "#27b3a8" },
                      { state: "Completed", fill: "#3dd4c8" },
                      { state: "Failed", fill: "#e05555" },
                    ].map((entry, index) => (
                      <rect key={index} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </InstrumentCardBody>
        </InstrumentCard>
      </div>

      {/* Recent Activity Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Recent Jobs */}
        <InstrumentCard className="lg:col-span-2">
          <InstrumentCardHeader
            title="Recent Jobs"
            subtitle={`${jobs.length} total`}
            icon={<ListChecks className="w-4 h-4" />}
            action={
              <Button variant="ghost" size="sm" onClick={() => navigate("/jobs")}>
                View all <ArrowRight className="w-3 h-3" />
              </Button>
            }
          />
          <InstrumentCardBody className="p-0">
            <div className="divide-y divide-border/50">
              {jobs.slice(0, 8).map((job) => (
                <button
                  key={job.id}
                  onClick={() => navigate(`/jobs/${job.id}`)}
                  className="flex items-center gap-3 w-full px-5 py-3 text-left hover:bg-cordum/5 transition-colors"
                >
                  <div className={cn(
                    "w-2 h-2 rounded-full shrink-0",
                    job.status === "running" && "bg-status-healthy",
                    job.status === "pending" && "bg-status-warning",
                    job.status === "scheduled" && "bg-status-warning",
                    job.status === "succeeded" && "bg-cordum",
                    job.status === "failed" && "bg-status-danger",
                    job.status === "dispatched" && "bg-status-info",
                  )} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate font-mono">
                      {job.id.slice(0, 12)}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {job.topic || "—"}
                    </p>
                  </div>
                  <StatusBadge
                    variant={
                      job.status === "running" ? "healthy" :
                      job.status === "failed" ? "danger" :
                      job.status === "succeeded" ? "cordum" :
                      "muted"
                    }
                  >
                    {job.status}
                  </StatusBadge>
                  <span className="text-[10px] text-muted-foreground font-mono whitespace-nowrap">
                    {job.updatedAt ? formatRelativeTime(new Date(job.updatedAt).toISOString()) : "—"}
                  </span>
                </button>
              ))}
              {jobs.length === 0 && !jobsLoading && (
                <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                  No jobs yet
                </div>
              )}
            </div>
          </InstrumentCardBody>
        </InstrumentCard>

        {/* Pending Approvals */}
        <InstrumentCard accent={pendingApprovals.length > 0 ? "warning" : "healthy"}>
          <InstrumentCardHeader
            title="Approval Queue"
            subtitle={`${pendingApprovals.length} pending`}
            icon={<UserCheck className="w-4 h-4" />}
            action={
              <Button variant="ghost" size="sm" onClick={() => navigate("/approvals")}>
                View all <ArrowRight className="w-3 h-3" />
              </Button>
            }
          />
          <InstrumentCardBody className="p-0">
            <div className="divide-y divide-border/50">
              {pendingApprovals.slice(0, 5).map((approval) => (
                <div
                  key={approval.id}
                  className="flex items-center gap-3 px-5 py-3 hover:bg-cordum/5 transition-colors cursor-pointer"
                  onClick={() => navigate("/approvals")}
                >
                  <Shield className="w-4 h-4 text-status-warning shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {approval.topic || approval.id.slice(0, 12)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {approval.requestedAt ? formatRelativeTime(approval.requestedAt) : "—"}
                    </p>
                  </div>
                  <StatusBadge variant="warning" dot pulse>
                    pending
                  </StatusBadge>
                </div>
              ))}
              {pendingApprovals.length === 0 && (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <CheckCircle2 className="w-8 h-8 text-status-healthy/40 mb-2" />
                  <p className="text-sm text-muted-foreground">All clear</p>
                </div>
              )}
            </div>
          </InstrumentCardBody>
        </InstrumentCard>
      </div>
    </div>
  );
}
