/*
 * DESIGN: "Control Surface" — Workflow Detail
 * Matches cordumds-gj5mw4zm.manus.space showcase patterns
 */
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { get } from "@/api/client";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { ArrowLeft, Play, Edit, GitBranch, Workflow, Eye, Shield, Link2 } from "lucide-react";
import { useState } from "react";
import { cn, formatRelativeTime } from "@/lib/utils";

interface WorkflowDetail {
  id: string;
  name: string;
  description?: string;
  version?: number;
  status?: string;
  steps?: Array<{ id: string; name: string; type: string; topic?: string; dependsOn?: string[] }>;
  runs?: Array<{ id: string; status: string; startedAt?: string; completedAt?: string; stepResults?: Record<string, string> }>;
  createdAt?: string;
  updatedAt?: string;
}

export default function WorkflowDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("steps");

  const { data: workflow, isLoading } = useQuery({
    queryKey: ["workflow", id],
    queryFn: async () => {
      const res = await get<WorkflowDetail>(`/workflows/${id}`);
      return res;
    },
    enabled: !!id,
  });

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
    { id: "runs", label: "Runs", count: workflow.runs?.length },
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
                <StatusBadge variant={workflow.status === "active" ? "healthy" : "muted"}>
                  {workflow.status ?? "active"}
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
          <Button variant="primary" size="sm">
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
                        {(s.dependsOn ?? []).map((d) => (
                          <span key={d} className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-cordum/10 text-cordum border border-cordum/20">{d}</span>
                        ))}
                        {(!s.dependsOn || s.dependsOn.length === 0) && <span className="text-xs text-muted-foreground">—</span>}
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
        (workflow.runs?.length ?? 0) === 0 ? (
          <EmptyState
            icon={<Play className="w-5 h-5" />}
            title="No runs yet"
            description="Run this workflow to see execution history"
            action={
              <Button variant="primary" size="sm">
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
                {(workflow.runs ?? []).map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => navigate(`/workflows/${id}/runs/${r.id}`)}
                    className="border-b border-border hover:bg-surface-1 transition-colors cursor-pointer"
                  >
                    <td className="px-5 py-3">
                      <StatusBadge
                        variant={r.status === "completed" ? "healthy" : r.status === "running" ? "info" : r.status === "failed" ? "danger" : "muted"}
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
          className="instrument-card p-5"
        >
          <h3 className="font-display font-semibold text-sm text-foreground mb-3">Workflow Configuration</h3>
          <div className="rounded-md bg-surface-0 border border-border p-4 font-mono text-xs text-foreground overflow-auto max-h-[400px]">
            <pre>{JSON.stringify(workflow, null, 2)}</pre>
          </div>
        </motion.div>
      )}

      {/* Policy Tab */}
      {activeTab === "policy" && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="space-y-4">
          {/* Bound Bundles */}
          <div className="instrument-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <Shield className="w-4 h-4 text-cordum" />
              <h3 className="font-display font-semibold text-sm text-foreground">Policy Bindings</h3>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              Policy bundles bound to this workflow. Rules in these bundles are evaluated for every job dispatched by this workflow.
            </p>
            <div className="space-y-2">
              <div className="rounded-lg bg-surface-0 border border-border p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-cordum/10 flex items-center justify-center">
                    <Shield className="w-4 h-4 text-cordum" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">No bundles bound</p>
                    <p className="text-xs text-muted-foreground">Bind a policy bundle to enforce rules on this workflow</p>
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={() => navigate("/policies/bundles")}>
                  <Link2 className="w-3 h-3 mr-1" />Bind Bundle
                </Button>
              </div>
            </div>
          </div>

          {/* Step-Level Overrides */}
          <div className="instrument-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <Shield className="w-4 h-4 text-cordum" />
              <h3 className="font-display font-semibold text-sm text-foreground">Step-Level Overrides</h3>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              Override policy rules for specific steps in this workflow.
            </p>
            {(workflow.steps?.length ?? 0) === 0 ? (
              <p className="text-xs text-muted-foreground">No steps defined in this workflow.</p>
            ) : (
              <div className="space-y-2">
                {(workflow.steps ?? []).map((step) => (
                  <div key={step.id} className="rounded-lg bg-surface-0 border border-border p-3 flex items-center justify-between">
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

          {/* Evaluation Summary */}
          <div className="instrument-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <Shield className="w-4 h-4 text-cordum" />
              <h3 className="font-display font-semibold text-sm text-foreground">Evaluation Summary</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              Connect to a live Cordum instance to see policy evaluation statistics for this workflow.
            </p>
          </div>
        </motion.div>
      )}
    </div>
  );
}
