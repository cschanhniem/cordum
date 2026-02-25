import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { get } from "@/api/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { InstrumentCard, InstrumentCardBody } from "@/components/ui/InstrumentCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonTable } from "@/components/ui/Skeleton";
import { DataTable } from "@/components/ui/DataTable";
import { Search, Plus, Workflow, RefreshCw, Play, GitBranch } from "lucide-react";
import { formatRelativeTime } from "@/lib/utils";

interface WorkflowSummary {
  id: string;
  name: string;
  description?: string;
  version?: number;
  status?: string;
  stepCount?: number;
  lastRunAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export default function WorkflowsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");

  const { data: workflows, isLoading, refetch } = useQuery({
    queryKey: ["workflows"],
    queryFn: async () => {
      const res = await get<{ items: WorkflowSummary[] }>("/workflows?limit=200");
      return res.items ?? [];
    },
    refetchInterval: 30_000,
  });

  const all = workflows ?? [];
  const filtered = all.filter((w) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return w.name.toLowerCase().includes(q) || w.id.toLowerCase().includes(q) || (w.description ?? "").toLowerCase().includes(q);
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Workflows"
        subtitle={`${all.length} workflow${all.length !== 1 ? "s" : ""}`}
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => refetch()}>
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh
            </Button>
            <Button variant="primary" size="sm" onClick={() => navigate("/workflows/new")}>
              <Plus className="w-3.5 h-3.5" />
              New Workflow
            </Button>
          </div>
        }
      />

      <Input
        icon={<Search className="w-3.5 h-3.5" />}
        placeholder="Search workflows…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />

      <InstrumentCard>
        <InstrumentCardBody className="p-0">
          {isLoading ? (
            <div className="p-5"><SkeletonTable rows={6} /></div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<Workflow className="w-5 h-5" />}
              title="No workflows found"
              description={search ? "Try adjusting your search" : "Create your first workflow to orchestrate agent tasks"}
              action={
                <Button variant="primary" size="sm" onClick={() => navigate("/workflows/new")}>
                  <Plus className="w-3.5 h-3.5" />
                  New Workflow
                </Button>
              }
            />
          ) : (
            <DataTable
              columns={[
                {
                  key: "name",
                  header: "Name",
                  render: (w) => (
                    <div>
                      <p className="text-sm font-medium text-foreground">{w.name}</p>
                      {w.description && <p className="text-xs text-muted-foreground truncate max-w-[300px]">{w.description}</p>}
                    </div>
                  ),
                },
                {
                  key: "version",
                  header: "Version",
                  width: "80px",
                  align: "center",
                  render: (w) => (
                    <span className="text-xs font-mono text-muted-foreground">v{w.version ?? 1}</span>
                  ),
                },
                {
                  key: "steps",
                  header: "Steps",
                  width: "80px",
                  align: "center",
                  render: (w) => (
                    <span className="text-xs font-mono text-muted-foreground">{w.stepCount ?? "—"}</span>
                  ),
                },
                {
                  key: "status",
                  header: "Status",
                  width: "100px",
                  render: (w) => (
                    <StatusBadge variant={w.status === "active" ? "healthy" : w.status === "draft" ? "muted" : "warning"}>
                      {w.status ?? "active"}
                    </StatusBadge>
                  ),
                },
                {
                  key: "lastRun",
                  header: "Last Run",
                  width: "120px",
                  align: "right",
                  render: (w) => (
                    <span className="text-xs text-muted-foreground font-mono">
                      {w.lastRunAt ? formatRelativeTime(w.lastRunAt) : "Never"}
                    </span>
                  ),
                },
              ]}
              data={filtered}
              keyExtractor={(w) => w.id}
              onRowClick={(w) => navigate(`/workflows/${w.id}`)}
            />
          )}
        </InstrumentCardBody>
      </InstrumentCard>
    </div>
  );
}
