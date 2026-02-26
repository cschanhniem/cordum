/*
 * DESIGN: "Control Surface" — Job Detail
 * Matches cordumds-gj5mw4zm.manus.space showcase patterns
 */
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { get } from "@/api/client";
import { mapJobDetail, type BackendJobDetail } from "@/api/transform";
import type { Job, OutputFinding } from "@/api/types";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  ArrowLeft, Copy, Play, XCircle, Clock, Shield,
  FileText, AlertTriangle, CheckCircle2, Workflow, Layers,
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
          <div className="w-6 h-[2px] rounded bg-red-400/40" />
          <div className="flex items-center justify-center w-7 h-7 rounded-full bg-red-500 text-white text-[9px] ring-2 ring-red-500/30">
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
        <AlertTriangle className="w-10 h-10 text-amber-400 mb-3" />
        <h2 className="text-lg font-semibold font-display text-foreground">Job not found</h2>
        <p className="text-sm text-muted-foreground mt-1">The job may have been purged or the ID is invalid.</p>
        <Button variant="outline" size="sm" className="mt-4" onClick={() => navigate("/jobs")}>
          <ArrowLeft className="w-3 h-3 mr-1" />
          Back to Jobs
        </Button>
      </div>
    );
  }

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "context", label: "Context" },
    { id: "result", label: "Result" },
    { id: "safety", label: "Safety Story" },
    { id: "terminal", label: "Terminal" },
    { id: "timeline", label: "Timeline" },
  ];

  return (
    <div className="space-y-6">
      {/* Header — showcase style */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/jobs")}
            className="p-2 rounded-md hover:bg-surface-2 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 text-muted-foreground" />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cordum/10 border border-cordum/20 flex items-center justify-center">
              <Layers className="w-5 h-5 text-cordum" />
            </div>
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
        </div>
        <div className="flex gap-2">
          {job.status === "failed" && (
            <Button variant="primary" size="sm">
              <Play className="w-3 h-3 mr-1" />
              Retry
            </Button>
          )}
          {(job.status === "running" || job.status === "pending") && (
            <Button variant="danger" size="sm">
              <XCircle className="w-3 h-3 mr-1" />
              Cancel
            </Button>
          )}
        </div>
      </div>

      {/* State Machine — showcase instrument card */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="instrument-card py-4 flex items-center justify-center"
      >
        <StateMachine currentState={job.status} />
      </motion.div>

      {/* Tabs — showcase style */}
      <div className="flex items-center gap-1 bg-surface-1 border border-border rounded-md p-0.5 w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "px-4 py-1.5 text-xs font-medium rounded transition-colors",
              activeTab === tab.id
                ? "bg-cordum/10 text-cordum"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === "overview" && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="grid grid-cols-1 lg:grid-cols-2 gap-4"
        >
          {/* Job Info */}
          <div className="instrument-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <FileText className="w-4 h-4 text-cordum" />
              <h3 className="font-display font-semibold text-sm text-foreground">Job Info</h3>
            </div>
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
                  <dt className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">{label}</dt>
                  <dd className="text-sm text-foreground font-mono text-right max-w-[60%] truncate">
                    {value || "—"}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          {/* Safety Decision */}
          <div className={cn(
            "instrument-card p-5",
            job.safetyDecision?.type === "deny" ? "status-danger" : job.safetyDecision?.type === "allow" ? "" : "",
          )}>
            <div className="flex items-center gap-2 mb-4">
              <Shield className="w-4 h-4 text-cordum" />
              <h3 className="font-display font-semibold text-sm text-foreground">Safety Decision</h3>
            </div>
            <dl className="space-y-3">
              {[
                ["Decision", job.safetyDecision?.type],
                ["Reason", job.safetyDecision?.reason],
                ["Rule ID", job.safetyDecision?.matchedRule],
                ["Risk Tags", (job.riskTags ?? []).join(", ")],
              ].map(([label, value]) => (
                <div key={label} className="flex items-start justify-between">
                  <dt className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">{label}</dt>
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
          </div>

          {/* Workflow link */}
          {job.workflowId && (
            <div className="instrument-card p-5 lg:col-span-2">
              <div className="flex items-center gap-2 mb-4">
                <Workflow className="w-4 h-4 text-cordum" />
                <h3 className="font-display font-semibold text-sm text-foreground">Workflow Context</h3>
              </div>
              <div className="flex items-center gap-6">
                <div>
                  <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Workflow</p>
                  <p className="text-sm font-mono text-cordum mt-0.5">{job.workflowId}</p>
                </div>
                {job.workflowRunId && (
                  <div>
                    <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Run</p>
                    <p className="text-sm font-mono text-cordum mt-0.5">{job.workflowRunId}</p>
                  </div>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="ml-auto"
                  onClick={() => navigate(`/workflows/${job.workflowId}`)}
                >
                  View Workflow →
                </Button>
              </div>
            </div>
          )}

          {/* Error section */}
          {job.errorMessage && (
            <div className="instrument-card status-danger p-5 lg:col-span-2">
              <div className="flex items-center gap-2 mb-4">
                <AlertTriangle className="w-4 h-4 text-red-400" />
                <h3 className="font-display font-semibold text-sm text-foreground">Error</h3>
              </div>
              <div className="rounded-md bg-red-500/5 border border-red-500/15 p-4">
                <p className="text-sm font-mono text-red-400 whitespace-pre-wrap">{job.errorMessage}</p>
                {job.errorCode && (
                  <p className="text-xs text-muted-foreground mt-2 font-mono">
                    Code: {job.errorCode} {job.errorCodeEnum ? `(${job.errorCodeEnum})` : ""}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Labels */}
          {job.labels && Object.keys(job.labels).length > 0 && (
            <div className="instrument-card p-5 lg:col-span-2">
              <h3 className="font-display font-semibold text-sm text-foreground mb-3">Labels</h3>
              <div className="flex flex-wrap gap-2">
                {Object.entries(job.labels).map(([k, v]) => (
                  <span key={k} className="text-xs font-mono px-2 py-1 rounded-full bg-surface-2 border border-border text-foreground">
                    <span className="text-muted-foreground">{k}:</span> {v}
                  </span>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      )}

      {/* Context Tab */}
      {activeTab === "context" && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="instrument-card p-5"
        >
          <div className="flex items-center gap-2 mb-4">
            <FileText className="w-4 h-4 text-cordum" />
            <h3 className="font-display font-semibold text-sm text-foreground">Job Context</h3>
          </div>
          <div className="rounded-md bg-surface-0 border border-border p-4 font-mono text-xs text-foreground overflow-auto max-h-[400px]">
            {job.contextPtr ? (
              <pre>{job.contextPtr}</pre>
            ) : (
              <p className="text-muted-foreground italic">No context data available</p>
            )}
          </div>
        </motion.div>
      )}

      {/* Result Tab */}
      {activeTab === "result" && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="instrument-card p-5"
        >
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle2 className="w-4 h-4 text-cordum" />
            <h3 className="font-display font-semibold text-sm text-foreground">Job Result</h3>
          </div>
          <div className="rounded-md bg-surface-0 border border-border p-4 font-mono text-xs text-foreground overflow-auto max-h-[400px]">
            {job.resultPtr ? (
              <pre>{job.resultPtr}</pre>
            ) : (
              <p className="text-muted-foreground italic">No result data available</p>
            )}
          </div>
        </motion.div>
      )}

      {/* Safety Story Tab */}
      {activeTab === "safety" && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="space-y-4">
          {/* Step 1: Input Evaluation */}
          <div className="instrument-card p-0 overflow-hidden">
            <div className="px-5 py-3 border-b border-border bg-surface-0 flex items-center gap-2">
              <div className="w-5 h-5 rounded-full bg-cordum/15 flex items-center justify-center text-[10px] font-mono font-bold text-cordum">1</div>
              <span className="text-xs font-mono font-medium text-foreground">Input Policy Evaluation</span>
              <StatusBadge variant={job.safetyDecision?.type === "deny" ? "danger" : job.safetyDecision?.type === "require_approval" ? "warning" : "healthy"}>
                {job.safetyDecision?.type ?? "no evaluation"}
              </StatusBadge>
            </div>
            <div className="p-5 space-y-3">
              <dl className="space-y-3">
                {[
                  ["Decision", job.safetyDecision?.type ?? "\u2014"],
                  ["Reason", job.safetyDecision?.reason ?? "\u2014"],
                  ["Matched Rule", job.safetyDecision?.matchedRule ?? "\u2014"],
                  ["Eval Time", job.safetyDecision?.evalTimeMs ? `${job.safetyDecision.evalTimeMs}ms` : "\u2014"],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between">
                    <dt className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">{label}</dt>
                    <dd className="text-sm font-mono text-foreground">{value}</dd>
                  </div>
                ))}
              </dl>
              {/* Evaluation path */}
              {job.safetyDecision?.evalPath && job.safetyDecision.evalPath.length > 0 && (
                <div className="mt-3">
                  <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-2">Evaluation Path</p>
                  <div className="flex items-center gap-1 flex-wrap">
                    {job.safetyDecision.evalPath.map((step, i) => (
                      <span key={i} className="inline-flex items-center">
                        <span className="px-2 py-0.5 rounded bg-surface-1 border border-border text-[10px] font-mono text-foreground">{step}</span>
                        {i < (job.safetyDecision?.evalPath?.length ?? 0) - 1 && <span className="text-muted-foreground mx-1">&rarr;</span>}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Step 2: Constraints Applied */}
          {job.safetyDecision?.type === "allow_with_constraints" && (
            <div className="instrument-card p-0 overflow-hidden">
              <div className="px-5 py-3 border-b border-border bg-surface-0 flex items-center gap-2">
                <div className="w-5 h-5 rounded-full bg-amber-400/15 flex items-center justify-center text-[10px] font-mono font-bold text-amber-400">2</div>
                <span className="text-xs font-mono font-medium text-foreground">Constraints Applied</span>
                <StatusBadge variant="warning">constrained</StatusBadge>
              </div>
              <div className="p-5">
                <p className="text-xs text-muted-foreground">This job was allowed with constraints. Connect to a live Cordum instance to see constraint details.</p>
              </div>
            </div>
          )}

          {/* Step 3: Output Evaluation */}
          <div className={cn("instrument-card p-0 overflow-hidden", job.output_safety?.decision === "QUARANTINE" ? "status-danger" : "")}>
            <div className="px-5 py-3 border-b border-border bg-surface-0 flex items-center gap-2">
              <div className="w-5 h-5 rounded-full bg-blue-400/15 flex items-center justify-center text-[10px] font-mono font-bold text-blue-400">{job.safetyDecision?.type === "allow_with_constraints" ? "3" : "2"}</div>
              <span className="text-xs font-mono font-medium text-foreground">Output Policy Evaluation</span>
              {job.output_safety ? (
                <StatusBadge variant={job.output_safety.decision === "ALLOW" ? "healthy" : job.output_safety.decision === "REDACT" ? "warning" : "danger"}>
                  {job.output_safety.decision}
                </StatusBadge>
              ) : (
                <StatusBadge variant="muted">not evaluated</StatusBadge>
              )}
            </div>
            <div className="p-5 space-y-3">
              {job.output_safety ? (
                <>
                  <dl className="space-y-3">
                    <div className="flex justify-between">
                      <dt className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Decision</dt>
                      <dd><StatusBadge variant={job.output_safety.decision === "ALLOW" ? "healthy" : "danger"}>{job.output_safety.decision}</StatusBadge></dd>
                    </div>
                    {job.output_safety.reason && (
                      <div className="flex justify-between">
                        <dt className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Reason</dt>
                        <dd className="text-sm font-mono text-foreground">{job.output_safety.reason}</dd>
                      </div>
                    )}
                    {job.output_safety.rule_id && (
                      <div className="flex justify-between">
                        <dt className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Rule</dt>
                        <dd className="text-sm font-mono text-foreground">{job.output_safety.rule_id}</dd>
                      </div>
                    )}
                  </dl>
                  {job.output_safety.findings && job.output_safety.findings.length > 0 && (
                    <div className="mt-3 space-y-2">
                      <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Findings</p>
                      {job.output_safety.findings.map((f: OutputFinding, i: number) => (
                        <div key={i} className="rounded-md bg-surface-0 border border-border p-3">
                          <div className="flex items-center gap-2 mb-1">
                            <StatusBadge variant={f.severity === "critical" ? "danger" : f.severity === "high" ? "warning" : "muted"}>{f.severity}</StatusBadge>
                            <span className="text-xs font-mono text-foreground">{f.type}</span>
                            {f.scanner && <span className="text-[10px] text-muted-foreground">via {f.scanner}</span>}
                          </div>
                          <p className="text-xs text-muted-foreground">{f.detail}</p>
                          {f.matched_pattern && <p className="text-[10px] font-mono text-red-400 mt-1">Pattern: {f.matched_pattern}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                  {/* Redaction preview */}
                  {job.output_safety.decision === "REDACT" && job.output_safety.redacted_ptr && (
                    <div className="mt-3">
                      <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-2">Redacted Output</p>
                      <div className="bg-surface-0 rounded-lg border border-border p-3">
                        <pre className="text-xs font-mono text-foreground whitespace-pre-wrap">{job.output_safety.redacted_ptr}</pre>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-xs text-muted-foreground">No output policy evaluation was performed for this job.</p>
              )}
            </div>
          </div>
        </motion.div>
      )}

      {/* Terminal Tab */}
      {activeTab === "terminal" && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="instrument-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <FileText className="w-4 h-4 text-cordum" />
            <h3 className="font-display font-semibold text-sm text-foreground">Terminal Output</h3>
          </div>
          <div className="bg-surface-0 rounded-lg border border-border p-4 font-mono text-xs text-foreground min-h-[200px] max-h-[500px] overflow-auto">
            <p className="text-muted-foreground italic">Terminal output will appear here when connected to a live Cordum instance with streaming enabled.</p>
          </div>
        </motion.div>
      )}

      {/* Timeline Tab */}
      {activeTab === "timeline" && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="instrument-card p-5"
        >
          <div className="flex items-center gap-2 mb-4">
            <Clock className="w-4 h-4 text-cordum" />
            <h3 className="font-display font-semibold text-sm text-foreground">Event Timeline</h3>
          </div>
          <p className="text-sm text-muted-foreground italic">
            Timeline events will appear here when connected to a live Cordum instance.
          </p>
        </motion.div>
      )}
    </div>
  );
}
