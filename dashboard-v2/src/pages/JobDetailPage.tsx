import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { get } from "@/api/client";
import { mapJobDetail, type BackendJobDetail } from "@/api/transform";
import type { Job } from "@/api/types";
import { PageHeader } from "@/components/layout/PageHeader";
import { InstrumentCard, InstrumentCardHeader, InstrumentCardBody, InstrumentCardFooter } from "@/components/ui/InstrumentCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { Tabs } from "@/components/ui/Tabs";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  ArrowLeft, Copy, RefreshCw, Play, XCircle, Clock, Shield,
  FileText, GitBranch, AlertTriangle, CheckCircle2, Workflow,
} from "lucide-react";
import { cn, formatRelativeTime, formatDuration } from "@/lib/utils";
import { useState } from "react";
import { toast } from "sonner";

function jobStatusVariant(status: string) {
  switch (status) {
    case "running": return "healthy" as const;
    case "completed": return "cordum" as const;
    case "failed": return "danger" as const;
    case "pending": case "scheduled": return "warning" as const;
    case "dispatched": return "info" as const;
    default: return "muted" as const;
  }
}

// State machine visualization
const JOB_STATES = ["pending", "scheduled", "dispatched", "running", "completed"];

function StateMachine({ currentState }: { currentState: string }) {
  const currentIdx = JOB_STATES.indexOf(currentState);
  const isFailed = currentState === "failed";

  return (
    <div className="flex items-center gap-1">
      {JOB_STATES.map((state, i) => {
        const isPast = i < currentIdx;
        const isCurrent = state === currentState;
        const isActive = isPast || isCurrent;

        return (
          <div key={state} className="flex items-center gap-1">
            <div
              className={cn(
                "flex items-center justify-center w-7 h-7 rounded-full text-[9px] font-mono uppercase transition-all",
                isCurrent && !isFailed && "bg-cordum text-[#0f1518] ring-2 ring-cordum/30",
                isPast && "bg-cordum/20 text-cordum",
                !isActive && "bg-surface-2 text-muted-foreground",
              )}
            >
              {isPast ? "✓" : (i + 1)}
            </div>
            {i < JOB_STATES.length - 1 && (
              <div className={cn("w-6 h-[2px] rounded", isPast ? "bg-cordum/40" : "bg-border")} />
            )}
          </div>
        );
      })}
      {isFailed && (
        <>
          <div className="w-6 h-[2px] rounded bg-status-danger/40" />
          <div className="flex items-center justify-center w-7 h-7 rounded-full bg-status-danger text-white text-[9px] ring-2 ring-status-danger/30">
            ✕
          </div>
        </>
      )}
    </div>
  );
}

export default function JobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("overview");

  const { data: job, isLoading } = useQuery({
    queryKey: ["job", id],
    queryFn: async () => {
      const res = await get<BackendJobDetail>(`/jobs/${id}`);
      return mapJobDetail(res);
    },
    enabled: !!id,
    refetchInterval: 5_000,
  });

  const copyId = () => {
    if (id) {
      navigator.clipboard.writeText(id);
      toast.success("Job ID copied");
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-8" />
          <Skeleton className="h-6 w-48" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <AlertTriangle className="w-10 h-10 text-status-warning mb-3" />
        <h2 className="text-lg font-semibold font-display">Job not found</h2>
        <p className="text-sm text-muted-foreground mt-1">The job may have been purged or the ID is invalid.</p>
        <Button variant="secondary" size="sm" className="mt-4" onClick={() => navigate("/jobs")}>
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Jobs
        </Button>
      </div>
    );
  }

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "context", label: "Context" },
    { id: "result", label: "Result" },
    { id: "safety", label: "Safety" },
    { id: "timeline", label: "Timeline" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/jobs")}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold font-display text-foreground">
                Job {id?.slice(0, 12)}…
              </h1>
              <button onClick={copyId} className="text-muted-foreground hover:text-foreground transition-colors">
                <Copy className="w-3.5 h-3.5" />
              </button>
              <StatusBadge variant={jobStatusVariant(job.status)} dot pulse={job.status === "running"}>
                {job.status}
              </StatusBadge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 font-mono">{id}</p>
          </div>
        </div>
        <div className="flex gap-2">
          {job.status === "failed" && (
            <Button variant="primary" size="sm">
              <Play className="w-3.5 h-3.5" />
              Retry
            </Button>
          )}
          {(job.status === "running" || job.status === "pending") && (
            <Button variant="danger" size="sm">
              <XCircle className="w-3.5 h-3.5" />
              Cancel
            </Button>
          )}
        </div>
      </div>

      {/* State Machine */}
      <InstrumentCard>
        <InstrumentCardBody className="py-4 flex items-center justify-center">
          <StateMachine currentState={job.status} />
        </InstrumentCardBody>
      </InstrumentCard>

      {/* Tabs */}
      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {/* Tab Content */}
      {activeTab === "overview" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <InstrumentCard>
            <InstrumentCardHeader title="Job Info" icon={<FileText className="w-4 h-4" />} />
            <InstrumentCardBody>
              <dl className="space-y-3">
                {[
                  ["Topic", job.topic],
                  ["Tenant", job.tenant],
                  ["Team", job.team],
                  ["Actor", job.actorId ? `${job.actorId} (${job.actorType})` : "—"],
                  ["Capability", job.capability],
                  ["Attempts", String(job.attempts ?? 0)],
                  ["Trace ID", job.traceId],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-start justify-between">
                    <dt className="text-xs text-muted-foreground uppercase tracking-wider">{label}</dt>
                    <dd className="text-sm text-foreground font-mono text-right max-w-[60%] truncate">
                      {value || "—"}
                    </dd>
                  </div>
                ))}
              </dl>
            </InstrumentCardBody>
          </InstrumentCard>

          <InstrumentCard accent={job.safetyDecision?.type === "deny" ? "danger" : job.safetyDecision?.type === "allow" ? "healthy" : "muted"}>
            <InstrumentCardHeader title="Safety Decision" icon={<Shield className="w-4 h-4" />} />
            <InstrumentCardBody>
              <dl className="space-y-3">
                {[
                  ["Decision", job.safetyDecision?.type],
                  ["Reason", job.safetyDecision?.reason],
                  ["Rule ID", job.safetyDecision?.matchedRule],
                  ["Risk Tags", (job.riskTags ?? []).join(", ")],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-start justify-between">
                    <dt className="text-xs text-muted-foreground uppercase tracking-wider">{label}</dt>
                    <dd className="text-sm text-foreground text-right max-w-[60%]">
                      {label === "Decision" && value ? (
                        <StatusBadge
                          variant={
                            value === "allow" ? "healthy" :
                            value === "deny" ? "danger" :
                            "warning"
                          }
                        >
                          {value}
                        </StatusBadge>
                      ) : (
                        <span className="font-mono truncate">{value || "—"}</span>
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            </InstrumentCardBody>
          </InstrumentCard>

          {/* Workflow link */}
          {job.workflowId && (
            <InstrumentCard className="lg:col-span-2">
              <InstrumentCardHeader title="Workflow Context" icon={<Workflow className="w-4 h-4" />} />
              <InstrumentCardBody>
                <div className="flex items-center gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Workflow</p>
                    <p className="text-sm font-mono text-cordum">{job.workflowId}</p>
                  </div>
                  {job.workflowRunId && (
                    <div>
                      <p className="text-xs text-muted-foreground">Run</p>
                      <p className="text-sm font-mono text-cordum">{job.workflowRunId}</p>
                    </div>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-auto"
                    onClick={() => navigate(`/workflows/${job.workflowId}`)}
                  >
                    View Workflow →
                  </Button>
                </div>
              </InstrumentCardBody>
            </InstrumentCard>
          )}

          {/* Error section */}
          {job.errorMessage && (
            <InstrumentCard accent="danger" className="lg:col-span-2">
              <InstrumentCardHeader title="Error" icon={<AlertTriangle className="w-4 h-4" />} />
              <InstrumentCardBody>
                <div className="rounded-md bg-status-danger/5 border border-status-danger/15 p-4">
                  <p className="text-sm font-mono text-status-danger whitespace-pre-wrap">{job.errorMessage}</p>
                  {job.errorCode && (
                    <p className="text-xs text-muted-foreground mt-2 font-mono">
                      Code: {job.errorCode} {job.errorCodeEnum ? `(${job.errorCodeEnum})` : ""}
                    </p>
                  )}
                </div>
              </InstrumentCardBody>
            </InstrumentCard>
          )}

          {/* Labels */}
          {job.labels && Object.keys(job.labels).length > 0 && (
            <InstrumentCard className="lg:col-span-2">
              <InstrumentCardHeader title="Labels" />
              <InstrumentCardBody>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(job.labels).map(([k, v]) => (
                    <span key={k} className="text-xs font-mono px-2 py-1 rounded bg-surface-2 text-foreground">
                      <span className="text-muted-foreground">{k}:</span> {v}
                    </span>
                  ))}
                </div>
              </InstrumentCardBody>
            </InstrumentCard>
          )}
        </div>
      )}

      {activeTab === "context" && (
        <InstrumentCard>
          <InstrumentCardHeader title="Job Context" icon={<FileText className="w-4 h-4" />} />
          <InstrumentCardBody>
            <div className="rounded-md bg-surface-2/50 border border-border p-4 font-mono text-xs text-foreground overflow-auto max-h-[400px]">
              {job.contextPtr ? (
                <pre>{job.contextPtr}</pre>
              ) : (
                <p className="text-muted-foreground italic">No context data available</p>
              )}
            </div>
          </InstrumentCardBody>
        </InstrumentCard>
      )}

      {activeTab === "result" && (
        <InstrumentCard>
          <InstrumentCardHeader title="Job Result" icon={<CheckCircle2 className="w-4 h-4" />} />
          <InstrumentCardBody>
            <div className="rounded-md bg-surface-2/50 border border-border p-4 font-mono text-xs text-foreground overflow-auto max-h-[400px]">
              {job.resultPtr ? (
                <pre>{job.resultPtr}</pre>
              ) : (
                <p className="text-muted-foreground italic">No result data available</p>
              )}
            </div>
          </InstrumentCardBody>
        </InstrumentCard>
      )}

      {activeTab === "safety" && (
        <div className="space-y-4">
          <InstrumentCard accent={job.safetyDecision?.type === "deny" ? "danger" : "healthy"}>
            <InstrumentCardHeader title="Input Safety" icon={<Shield className="w-4 h-4" />} />
            <InstrumentCardBody>
              <dl className="space-y-3">
                {[
                  ["Decision", job.safetyDecision?.type ?? "—"],
                  ["Reason", job.safetyDecision?.reason ?? "—"],
                  ["Rule ID", job.safetyDecision?.matchedRule ?? "—"],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between">
                    <dt className="text-xs text-muted-foreground uppercase tracking-wider">{label}</dt>
                    <dd className="text-sm font-mono text-foreground">{value}</dd>
                  </div>
                ))}
              </dl>
            </InstrumentCardBody>
          </InstrumentCard>

          {job.output_safety && (
            <InstrumentCard accent={job.output_safety.decision === "QUARANTINE" ? "danger" : "healthy"}>
              <InstrumentCardHeader title="Output Safety" icon={<Shield className="w-4 h-4" />} />
              <InstrumentCardBody>
                <dl className="space-y-3">
                  <div className="flex justify-between">
                    <dt className="text-xs text-muted-foreground uppercase tracking-wider">Decision</dt>
                    <dd>
                      <StatusBadge variant={job.output_safety.decision === "ALLOW" ? "healthy" : "danger"}>
                        {job.output_safety.decision}
                      </StatusBadge>
                    </dd>
                  </div>
                  {job.output_safety.reason && (
                    <div className="flex justify-between">
                      <dt className="text-xs text-muted-foreground uppercase tracking-wider">Reason</dt>
                      <dd className="text-sm font-mono text-foreground">{job.output_safety.reason}</dd>
                    </div>
                  )}
                </dl>
                {job.output_safety.findings && job.output_safety.findings.length > 0 && (
                  <div className="mt-4 space-y-2">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">Findings</p>
                    {job.output_safety.findings.map((f: any, i: number) => (
                      <div key={i} className="rounded-md bg-surface-2/50 border border-border p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <StatusBadge variant={f.severity === "critical" ? "danger" : f.severity === "high" ? "warning" : "muted"}>
                            {f.severity}
                          </StatusBadge>
                          <span className="text-xs font-mono text-foreground">{f.type}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">{f.detail}</p>
                      </div>
                    ))}
                  </div>
                )}
              </InstrumentCardBody>
            </InstrumentCard>
          )}
        </div>
      )}

      {activeTab === "timeline" && (
        <InstrumentCard>
          <InstrumentCardHeader title="Event Timeline" icon={<Clock className="w-4 h-4" />} />
          <InstrumentCardBody>
            <p className="text-sm text-muted-foreground italic">
              Timeline events will appear here when connected to a live Cordum instance.
            </p>
          </InstrumentCardBody>
        </InstrumentCard>
      )}
    </div>
  );
}
