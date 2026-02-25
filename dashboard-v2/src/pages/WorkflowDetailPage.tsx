import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { get } from "@/api/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { InstrumentCard, InstrumentCardHeader, InstrumentCardBody } from "@/components/ui/InstrumentCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { Tabs } from "@/components/ui/Tabs";
import { DataTable } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { ArrowLeft, Play, Edit, Copy, GitBranch, Clock, Workflow } from "lucide-react";
import { useState } from "react";
import { formatRelativeTime } from "@/lib/utils";
import { toast } from "sonner";

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
        action={<Button variant="secondary" size="sm" onClick={() => navigate("/workflows")}><ArrowLeft className="w-3.5 h-3.5" /> Back</Button>}
      />
    );
  }

  const tabs = [
    { id: "steps", label: "Steps", count: workflow.steps?.length },
    { id: "runs", label: "Runs", count: workflow.runs?.length },
    { id: "config", label: "Configuration" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/workflows")}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold font-display text-foreground">{workflow.name}</h1>
              <StatusBadge variant={workflow.status === "active" ? "healthy" : "muted"}>
                {workflow.status ?? "active"}
              </StatusBadge>
              <span className="text-xs font-mono text-muted-foreground">v{workflow.version ?? 1}</span>
            </div>
            {workflow.description && <p className="text-sm text-muted-foreground mt-0.5">{workflow.description}</p>}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => navigate(`/workflows/${id}/edit`)}>
            <Edit className="w-3.5 h-3.5" />
            Edit
          </Button>
          <Button variant="primary" size="sm">
            <Play className="w-3.5 h-3.5" />
            Run
          </Button>
        </div>
      </div>

      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {activeTab === "steps" && (
        <InstrumentCard>
          <InstrumentCardBody className="p-0">
            {(workflow.steps?.length ?? 0) === 0 ? (
              <EmptyState
                icon={<GitBranch className="w-5 h-5" />}
                title="No steps defined"
                description="Edit this workflow to add steps"
              />
            ) : (
              <DataTable
                columns={[
                  {
                    key: "order",
                    header: "#",
                    width: "50px",
                    align: "center",
                    render: (_, i) => <span className="text-xs font-mono text-muted-foreground">{i + 1}</span>,
                  },
                  {
                    key: "name",
                    header: "Step Name",
                    render: (s) => <span className="text-sm font-medium text-foreground">{s.name}</span>,
                  },
                  {
                    key: "type",
                    header: "Type",
                    width: "100px",
                    render: (s) => (
                      <span className="text-xs font-mono px-2 py-0.5 rounded bg-surface-2 text-muted-foreground">{s.type}</span>
                    ),
                  },
                  {
                    key: "topic",
                    header: "Topic",
                    render: (s) => <span className="text-xs font-mono text-muted-foreground">{s.topic ?? "—"}</span>,
                  },
                  {
                    key: "deps",
                    header: "Depends On",
                    render: (s) => (
                      <div className="flex gap-1">
                        {(s.dependsOn ?? []).map((d) => (
                          <span key={d} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cordum/10 text-cordum">{d}</span>
                        ))}
                        {(!s.dependsOn || s.dependsOn.length === 0) && <span className="text-xs text-muted-foreground">—</span>}
                      </div>
                    ),
                  },
                ]}
                data={workflow.steps ?? []}
                keyExtractor={(s) => s.id}
              />
            )}
          </InstrumentCardBody>
        </InstrumentCard>
      )}

      {activeTab === "runs" && (
        <InstrumentCard>
          <InstrumentCardBody className="p-0">
            {(workflow.runs?.length ?? 0) === 0 ? (
              <EmptyState
                icon={<Play className="w-5 h-5" />}
                title="No runs yet"
                description="Run this workflow to see execution history"
                action={<Button variant="primary" size="sm"><Play className="w-3.5 h-3.5" /> Run Now</Button>}
              />
            ) : (
              <DataTable
                columns={[
                  {
                    key: "status",
                    header: "Status",
                    width: "100px",
                    render: (r) => (
                      <StatusBadge
                        variant={r.status === "completed" ? "healthy" : r.status === "running" ? "info" : r.status === "failed" ? "danger" : "muted"}
                        dot
                        pulse={r.status === "running"}
                      >
                        {r.status}
                      </StatusBadge>
                    ),
                  },
                  {
                    key: "id",
                    header: "Run ID",
                    render: (r) => <span className="font-mono text-xs text-cordum">{r.id.slice(0, 16)}</span>,
                  },
                  {
                    key: "started",
                    header: "Started",
                    render: (r) => <span className="text-xs text-muted-foreground font-mono">{r.startedAt ? formatRelativeTime(r.startedAt) : "—"}</span>,
                  },
                  {
                    key: "completed",
                    header: "Completed",
                    align: "right",
                    render: (r) => <span className="text-xs text-muted-foreground font-mono">{r.completedAt ? formatRelativeTime(r.completedAt) : "—"}</span>,
                  },
                ]}
                data={workflow.runs ?? []}
                keyExtractor={(r) => r.id}
                onRowClick={(r) => navigate(`/workflows/${id}/runs/${r.id}`)}
              />
            )}
          </InstrumentCardBody>
        </InstrumentCard>
      )}

      {activeTab === "config" && (
        <InstrumentCard>
          <InstrumentCardHeader title="Workflow Configuration" />
          <InstrumentCardBody>
            <div className="rounded-md bg-surface-2/50 border border-border p-4 font-mono text-xs text-foreground overflow-auto max-h-[400px]">
              <pre>{JSON.stringify(workflow, null, 2)}</pre>
            </div>
          </InstrumentCardBody>
        </InstrumentCard>
      )}
    </div>
  );
}
