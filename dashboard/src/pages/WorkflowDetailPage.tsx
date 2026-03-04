/*
 * DESIGN: "Control Surface" — Workflow Detail
 * Matches cordumds-gj5mw4zm.manus.space showcase patterns
 */
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { ArrowLeft, Play, Edit, GitBranch, Workflow, Eye, Shield, Save } from "lucide-react";
import { useMemo, useState } from "react";
import { cn, formatRelativeTime, clickableRowProps } from "@/lib/utils";
import { useWorkflow, useRuns, useStartRun, useUpdateWorkflow } from "@/hooks/useWorkflows";
import { useRunStream } from "@/hooks/useRunStream";
import { toast } from "sonner";
import type { PolicyConstraints, WorkflowRun } from "@/api/types";
import { WorkflowPolicyOverrides, extractConstraints } from "@/components/workflows/WorkflowPolicyOverrides";
import { WorkflowPolicyOverrideRules, extractWorkflowRules } from "@/components/workflows/WorkflowPolicyOverrideRules";
import { PageHeader } from "@/components/layout/PageHeader";
import { InstrumentCard, InstrumentCardHeader } from "@/components/ui/InstrumentCard";

export default function WorkflowDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("steps");
  const startRun = useStartRun();
  const updateWorkflow = useUpdateWorkflow();
  const [constraintDraft, setConstraintDraft] = useState<PolicyConstraints | null>(null);

  // Subscribe to WebSocket run events — patches React Query cache for instant status updates
  useRunStream(null);

  const { data: workflow, isLoading } = useWorkflow(id);
  const { data: runs } = useRuns(id);

  const savedConstraints = useMemo(
    () => extractConstraints(workflow?.config, workflow?.metadata),
    [workflow?.config, workflow?.metadata],
  );
  const workflowRules = useMemo(
    () => extractWorkflowRules(workflow?.config, workflow?.metadata),
    [workflow?.config, workflow?.metadata],
  );
  const activeConstraints = constraintDraft ?? savedConstraints;
  const constraintsDirty = constraintDraft !== null;

  const saveConstraints = async () => {
    if (!workflow || !constraintDraft) return;
    try {
      await updateWorkflow.mutateAsync({
        id: workflow.id,
        name: workflow.name,
        config: { ...(workflow.config ?? {}), constraints: constraintDraft },
      });
      setConstraintDraft(null);
      toast.success("Policy overrides saved");
    } catch {
      toast.error("Failed to save policy overrides");
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!workflow) {
    return (
      <EmptyState
        icon={<Workflow className="w-5 h-5" />}
        title="Workflow not found"
        action={
          <Button variant="outline" size="sm" onClick={() => navigate("/workflows")}>
            <ArrowLeft className="w-3 h-3 mr-1" />
            Back
          </Button>
        }
      />
    );
  }

  const tabs = [
    { id: "steps", label: "Steps", count: workflow.steps?.length },
    { id: "runs", label: "Runs", count: runs?.length },
    { id: "config", label: "Configuration" },
    { id: "policy", label: "Policy" },
  ];

  return (
    <div className="space-y-6">
      {/* Header — showcase style */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/workflows")}
            className="p-2 rounded-md hover:bg-surface-2 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 text-muted-foreground" />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cordum/10 border border-cordum/20 flex items-center justify-center">
              <GitBranch className="w-5 h-5 text-cordum" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold font-display text-foreground">{workflow.name}</h1>
                <StatusBadge variant="healthy">
                  active
                </StatusBadge>
                <span className="text-xs font-mono text-muted-foreground px-1.5 py-0.5 rounded bg-surface-2">v{workflow.version ?? 1}</span>
              </div>
              {workflow.description && <p className="text-sm text-muted-foreground mt-0.5">{workflow.description}</p>}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate(`/workflows/${id}/edit`)}>
            <Edit className="w-3 h-3 mr-1" />
            Edit
          </Button>
          <Button
            variant="primary"
            size="sm"
            loading={startRun.isPending}
            onClick={() => { if (!id) return; startRun.mutate({ workflowId: id }, {
              onSuccess: (data) => {
                toast.success("Workflow run started");
                if (data?.run_id) navigate(`/workflows/${id}/runs/${data.run_id}`);
              },
              onError: () => toast.error("Failed to start workflow run"),
            }); }}
          >
            <Play className="w-3 h-3 mr-1" />
            Run
          </Button>
        </div>
      </div>

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
            {tab.count !== undefined && tab.count > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-mono bg-surface-2">{tab.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Steps Tab */}
      {activeTab === "steps" && (
        (workflow.steps?.length ?? 0) === 0 ? (
          <EmptyState
            icon={<GitBranch className="w-5 h-5" />}
            title="No steps defined"
            description="Edit this workflow to add steps"
          />
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="instrument-card overflow-hidden"
          >
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-surface-0">
                  <th className="text-center px-5 py-3 text-xs font-mono font-medium text-muted-foreground uppercase tracking-wider w-12">#</th>
                  <th className="text-left px-5 py-3 text-xs font-mono font-medium text-muted-foreground uppercase tracking-wider">Step Name</th>
                  <th className="text-left px-5 py-3 text-xs font-mono font-medium text-muted-foreground uppercase tracking-wider w-24">Type</th>
                  <th className="text-left px-5 py-3 text-xs font-mono font-medium text-muted-foreground uppercase tracking-wider">Topic</th>
                  <th className="text-left px-5 py-3 text-xs font-mono font-medium text-muted-foreground uppercase tracking-wider">Depends On</th>
                </tr>
              </thead>
              <tbody>
                {(workflow.steps ?? []).map((s, i) => (
                  <tr key={s.id} className="border-b border-border hover:bg-surface-1 transition-colors">
                    <td className="px-5 py-3 text-center font-mono text-xs text-muted-foreground">{i + 1}</td>
                    <td className="px-5 py-3 text-sm font-medium text-foreground">{s.name}</td>
                    <td className="px-5 py-3">
                      <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-surface-2 border border-border text-muted-foreground">{s.type}</span>
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-muted-foreground">{s.topic ?? "—"}</td>
                    <td className="px-5 py-3">
                      <div className="flex gap-1">
                        {(s.depends_on ?? []).map((d) => (
                          <span key={d} className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-cordum/10 text-cordum border border-cordum/20">{d}</span>
                        ))}
                        {(!s.depends_on || s.depends_on.length === 0) && <span className="text-xs text-muted-foreground">—</span>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </motion.div>
        )
      )}

      {/* Runs Tab */}
      {activeTab === "runs" && (
        (runs?.length ?? 0) === 0 ? (
          <EmptyState
            icon={<Play className="w-5 h-5" />}
            title="No runs yet"
            description="Run this workflow to see execution history"
            action={
              <Button
                variant="primary"
                size="sm"
                loading={startRun.isPending}
                onClick={() => { if (!id) return; startRun.mutate({ workflowId: id }, {
                  onSuccess: (data) => {
                    toast.success("Workflow run started");
                    if (data?.run_id) navigate(`/workflows/${id}/runs/${data.run_id}`);
                  },
                  onError: () => toast.error("Failed to start workflow run"),
                }); }}
              >
                <Play className="w-3 h-3 mr-1" />
                Run Now
              </Button>
            }
          />
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="instrument-card overflow-hidden"
          >
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-surface-0">
                  <th className="text-left px-5 py-3 text-xs font-mono font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                  <th className="text-left px-5 py-3 text-xs font-mono font-medium text-muted-foreground uppercase tracking-wider">Run ID</th>
                  <th className="text-left px-5 py-3 text-xs font-mono font-medium text-muted-foreground uppercase tracking-wider">Started</th>
                  <th className="text-right px-5 py-3 text-xs font-mono font-medium text-muted-foreground uppercase tracking-wider">Completed</th>
                  <th className="px-5 py-3 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {(runs ?? []).map((r: WorkflowRun) => (
                  <tr
                    key={r.id}
                    {...clickableRowProps(() => navigate(`/workflows/${id}/runs/${r.id}`))}
                    className="border-b border-border hover:bg-surface-1 transition-colors cursor-pointer"
                  >
                    <td className="px-5 py-3">
                      <StatusBadge
                        variant={r.status === "succeeded" ? "healthy" : r.status === "running" ? "info" : r.status === "failed" ? "danger" : "muted"}
                        dot
                        pulse={r.status === "running"}
                      >
                        {r.status}
                      </StatusBadge>
                    </td>
                    <td className="px-5 py-3 font-mono text-sm text-cordum">{r.id.slice(0, 16)}</td>
                    <td className="px-5 py-3 text-xs text-muted-foreground font-mono">{r.startedAt ? formatRelativeTime(r.startedAt) : "—"}</td>
                    <td className="px-5 py-3 text-right text-xs text-muted-foreground font-mono">{r.completedAt ? formatRelativeTime(r.completedAt) : "—"}</td>
                    <td className="px-5 py-3">
                      <button className="p-1 rounded hover:bg-surface-2 transition-colors">
                        <Eye className="w-3.5 h-3.5 text-muted-foreground" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </motion.div>
        )
      )}

      {/* Config Tab */}
      {activeTab === "config" && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="instrument-card"
        >
          <InstrumentCardHeader title="Workflow Configuration" icon={<Workflow className="w-4 h-4" />} />
          <div className="surface-inset p-4 font-mono text-xs text-foreground overflow-auto max-h-[400px]">
            <pre>{JSON.stringify(workflow, null, 2)}</pre>
          </div>
        </motion.div>
      )}

      {/* Policy Tab */}
      {activeTab === "policy" && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="space-y-4">
          {constraintsDirty && (
            <div className="flex items-center justify-between rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2">
              <span className="text-xs text-amber-200">Unsaved constraint changes</span>
              <Button
                size="sm"
                loading={updateWorkflow.isPending}
                onClick={() => void saveConstraints()}
              >
                <Save className="w-3 h-3 mr-1" />
                Save Overrides
              </Button>
            </div>
          )}

          <WorkflowPolicyOverrides
            constraints={activeConstraints}
            readOnly={false}
            onChange={setConstraintDraft}
          />

          <WorkflowPolicyOverrideRules rules={workflowRules} />

          {/* Step-Level Overrides */}
          <div className="instrument-card">
            <InstrumentCardHeader
              title="Step-Level Overrides"
              subtitle="Each step inherits workflow-level constraints."
              icon={<Shield className="w-4 h-4" />}
            />
            {(workflow.steps?.length ?? 0) === 0 ? (
              <p className="text-xs text-muted-foreground">No steps defined in this workflow.</p>
            ) : (
              <div className="space-y-2 mt-1">
                {(workflow.steps ?? []).map((step) => (
                  <div key={step.id} className="surface-inset p-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-surface-2 border border-border text-muted-foreground">{step.type}</span>
                      <span className="text-sm font-medium text-foreground">{step.name}</span>
                    </div>
                    <span className="text-[10px] font-mono text-muted-foreground">inherits workflow policy</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Global Policy Link */}
          <div className="instrument-card">
            <InstrumentCardHeader
              title="Global Policy"
              subtitle="Workflow constraints merge with global policy rules during evaluation."
              icon={<Shield className="w-4 h-4" />}
            />
            <div className="mt-1">
              <Button variant="outline" size="sm" onClick={() => navigate("/govern/input-rules")}>
                <Shield className="w-3 h-3 mr-1" />View Global Rules
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
