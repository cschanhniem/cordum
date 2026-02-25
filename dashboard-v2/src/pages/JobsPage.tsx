import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { get } from "@/api/client";
import { mapJobRecord, type BackendJobRecord } from "@/api/transform";
import type { Job } from "@/api/types";
import { PageHeader } from "@/components/layout/PageHeader";
import { InstrumentCard, InstrumentCardBody } from "@/components/ui/InstrumentCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Tabs } from "@/components/ui/Tabs";
import { DataTable } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonTable } from "@/components/ui/Skeleton";
import { Search, RefreshCw, ListChecks, Plus, Filter, Download } from "lucide-react";
import { formatRelativeTime, truncate } from "@/lib/utils";

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

function safetyVariant(decision?: string) {
  switch (decision) {
    case "allow": return "healthy" as const;
    case "deny": return "danger" as const;
    case "escalate": return "warning" as const;
    default: return "muted" as const;
  }
}

export default function JobsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("all");

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["jobs"],
    queryFn: async () => {
      const res = await get<{ items: BackendJobRecord[]; total?: number }>("/jobs?limit=500");
      const items = (res.items ?? []).map(mapJobRecord).filter((j): j is Job => !!j);
      return { items, total: res.total ?? items.length };
    },
    refetchInterval: 10_000,
  });

  const jobs = data?.items ?? [];

  const tabs = [
    { id: "all", label: "All", count: jobs.length },
    { id: "running", label: "Running", count: jobs.filter(j => j.status === "running").length },
    { id: "pending", label: "Pending", count: jobs.filter(j => j.status === "pending" || j.status === "scheduled").length },
    { id: "succeeded", label: "Completed", count: jobs.filter(j => j.status === "succeeded").length },
    { id: "failed", label: "Failed", count: jobs.filter(j => j.status === "failed").length },
  ];

  const filtered = jobs.filter((j) => {
    if (activeTab !== "all") {
      if (activeTab === "pending") {
        if (j.status !== "pending" && j.status !== "scheduled") return false;
      } else if (j.status !== activeTab) return false;
    }
    if (search) {
      const q = search.toLowerCase();
      return (
        j.id.toLowerCase().includes(q) ||
        (j.topic ?? "").toLowerCase().includes(q) ||
        (j.traceId ?? "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Jobs"
        subtitle={`${data?.total ?? 0} total jobs`}
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => refetch()}>
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh
            </Button>
            <Button variant="primary" size="sm">
              <Plus className="w-3.5 h-3.5" />
              Submit Job
            </Button>
          </div>
        }
      />

      {/* Filters bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <Input
          icon={<Search className="w-3.5 h-3.5" />}
          placeholder="Search by ID, topic, or trace…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} className="border-none" />
      </div>

      {/* Jobs Table */}
      <InstrumentCard>
        <InstrumentCardBody className="p-0">
          {isLoading ? (
            <div className="p-5">
              <SkeletonTable rows={8} />
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<ListChecks className="w-5 h-5" />}
              title="No jobs found"
              description={search ? "Try adjusting your search or filters" : "No jobs have been submitted yet"}
              action={
                <Button variant="primary" size="sm">
                  <Plus className="w-3.5 h-3.5" />
                  Submit Job
                </Button>
              }
            />
          ) : (
            <DataTable
              columns={[
                {
                  key: "status",
                  header: "Status",
                  width: "100px",
                  render: (j) => (
                    <StatusBadge variant={jobStatusVariant(j.status)} dot pulse={j.status === "running"}>
                      {j.status}
                    </StatusBadge>
                  ),
                },
                {
                  key: "id",
                  header: "Job ID",
                  render: (j) => (
                    <span className="font-mono text-xs text-cordum">{j.id.slice(0, 16)}</span>
                  ),
                },
                {
                  key: "topic",
                  header: "Topic",
                  render: (j) => (
                    <span className="text-sm text-foreground">{j.topic || "—"}</span>
                  ),
                },
                {
                  key: "safety",
                  header: "Safety",
                  width: "100px",
                  render: (j) =>
                    j.safetyDecision ? (
                      <StatusBadge variant={safetyVariant(j.safetyDecision.type)}>
                        {j.safetyDecision.type}
                      </StatusBadge>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    ),
                },
                {
                  key: "attempts",
                  header: "Attempts",
                  width: "80px",
                  align: "center",
                  render: (j) => (
                    <span className="text-xs font-mono text-muted-foreground">{j.attempts ?? 0}</span>
                  ),
                },
                {
                  key: "updated",
                  header: "Updated",
                  width: "120px",
                  align: "right",
                  render: (j) => (
                    <span className="text-xs text-muted-foreground font-mono">
                      {j.updatedAt ? formatRelativeTime(new Date(j.updatedAt).toISOString()) : "—"}
                    </span>
                  ),
                },
              ]}
              data={filtered}
              keyExtractor={(j) => j.id}
              onRowClick={(j) => navigate(`/jobs/${j.id}`)}
            />
          )}
        </InstrumentCardBody>
      </InstrumentCard>
    </div>
  );
}
