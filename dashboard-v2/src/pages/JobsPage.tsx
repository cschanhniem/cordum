/*
 * DESIGN: "Control Surface" — Jobs
 * PRD: Sortable columns, CSV export, real-time refresh indicator
 */
import { useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { get } from "@/api/client";
import { mapJobRecord, type BackendJobRecord } from "@/api/transform";
import type { Job } from "@/api/types";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonTable } from "@/components/ui/Skeleton";
import { Search, RefreshCw, ListChecks, Plus, Eye, Download, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { cn, formatRelativeTime } from "@/lib/utils";
import { toast } from "sonner";

function jobStatusVariant(status: string) {
  switch (status) {
    case "running": return "healthy" as const;
    case "succeeded": return "healthy" as const;
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

type SortKey = "status" | "id" | "topic" | "attempts" | "updatedAt";
type SortDir = "asc" | "desc";

const statusOrder: Record<string, number> = {
  running: 0, pending: 1, scheduled: 2, dispatched: 3, succeeded: 4, failed: 5, cancelled: 6,
};

export default function JobsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("updatedAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const { data, isLoading, refetch, dataUpdatedAt } = useQuery({
    queryKey: ["jobs"],
    queryFn: async () => {
      const res = await get<{ items: BackendJobRecord[]; total?: number }>("/jobs?limit=500");
      const items = (res.items ?? []).map(mapJobRecord).filter((j): j is Job => !!j);
      return { items, total: res.total ?? items.length };
    },
    refetchInterval: 10_000,
  });

  const jobs = data?.items ?? [];

  const tabs = useMemo(() => [
    { id: "all", label: "All", count: jobs.length },
    { id: "running", label: "Running", count: jobs.filter(j => j.status === "running").length },
    { id: "pending", label: "Pending", count: jobs.filter(j => j.status === "pending" || j.status === "scheduled").length },
    { id: "succeeded", label: "Completed", count: jobs.filter(j => j.status === "succeeded").length },
    { id: "failed", label: "Failed", count: jobs.filter(j => j.status === "failed").length },
  ], [jobs]);

  const toggleSort = useCallback((key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }, [sortKey]);

  const filtered = useMemo(() => {
    let result = jobs.filter((j) => {
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

    // Sort
    result.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "status":
          cmp = (statusOrder[a.status] ?? 99) - (statusOrder[b.status] ?? 99);
          break;
        case "id":
          cmp = a.id.localeCompare(b.id);
          break;
        case "topic":
          cmp = (a.topic ?? "").localeCompare(b.topic ?? "");
          break;
        case "attempts":
          cmp = (a.attempts ?? 0) - (b.attempts ?? 0);
          break;
        case "updatedAt":
          cmp = new Date(a.updatedAt ?? 0).getTime() - new Date(b.updatedAt ?? 0).getTime();
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return result;
  }, [jobs, activeTab, search, sortKey, sortDir]);

  const exportCSV = () => {
    const rows = filtered.map((j) =>
      [j.id, j.status, j.topic ?? "", j.safetyDecision?.type ?? "", j.attempts ?? 0, j.updatedAt ?? ""].join(",")
    );
    const csv = ["id,status,topic,safety,attempts,updatedAt", ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `jobs-export-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${filtered.length} jobs`);
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ArrowUpDown className="w-3 h-3 ml-1 opacity-30" />;
    return sortDir === "asc" ? <ArrowUp className="w-3 h-3 ml-1 text-cordum" /> : <ArrowDown className="w-3 h-3 ml-1 text-cordum" />;
  };

  const lastUpdated = dataUpdatedAt ? new Date(dataUpdatedAt) : null;

  return (
    <div className="space-y-6">
      <PageHeader
        label="Core"
        title="Jobs"
        subtitle={`${data?.total ?? 0} total jobs across all states`}
        actions={
          <div className="flex items-center gap-2">
            {lastUpdated && (
              <span className="text-[10px] font-mono text-muted-foreground hidden md:inline">
                Updated {formatRelativeTime(lastUpdated.toISOString())}
              </span>
            )}
            <Button variant="outline" size="sm" onClick={exportCSV}>
              <Download className="w-3 h-3 mr-1" />
              CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="w-3 h-3 mr-1" />
              Refresh
            </Button>
            <Button variant="primary" size="sm" onClick={() => toast.info("Feature coming soon")}>
              <Plus className="w-3 h-3 mr-1" />
              Submit Job
            </Button>
          </div>
        }
      />

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by ID, topic, or trace..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 w-full pl-8 pr-3 text-xs bg-surface-1 border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-cordum"
          />
        </div>
        <div className="flex items-center gap-1 bg-surface-1 border border-border rounded-md p-0.5">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded transition-colors",
                activeTab === tab.id
                  ? "bg-cordum/10 text-cordum"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
              {tab.count > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-mono bg-surface-2">{tab.count}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Jobs Table with sortable columns */}
      {isLoading ? (
        <div className="instrument-card p-5">
          <SkeletonTable rows={8} />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<ListChecks className="w-5 h-5" />}
          title="No jobs found"
          description={search ? "Try adjusting your search or filters" : "No jobs have been submitted yet"}
          action={
            <Button variant="primary" size="sm" onClick={() => toast.info("Feature coming soon")}>
              <Plus className="w-3 h-3 mr-1" />
              Submit Job
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
                <th
                  className="text-left px-5 py-3 text-xs font-mono font-medium text-muted-foreground uppercase tracking-wider cursor-pointer select-none hover:text-foreground transition-colors"
                  onClick={() => toggleSort("status")}
                >
                  <span className="inline-flex items-center">Status <SortIcon col="status" /></span>
                </th>
                <th
                  className="text-left px-5 py-3 text-xs font-mono font-medium text-muted-foreground uppercase tracking-wider cursor-pointer select-none hover:text-foreground transition-colors"
                  onClick={() => toggleSort("id")}
                >
                  <span className="inline-flex items-center">Job ID <SortIcon col="id" /></span>
                </th>
                <th
                  className="text-left px-5 py-3 text-xs font-mono font-medium text-muted-foreground uppercase tracking-wider cursor-pointer select-none hover:text-foreground transition-colors"
                  onClick={() => toggleSort("topic")}
                >
                  <span className="inline-flex items-center">Topic <SortIcon col="topic" /></span>
                </th>
                <th className="text-left px-5 py-3 text-xs font-mono font-medium text-muted-foreground uppercase tracking-wider">Safety</th>
                <th
                  className="text-center px-5 py-3 text-xs font-mono font-medium text-muted-foreground uppercase tracking-wider cursor-pointer select-none hover:text-foreground transition-colors"
                  onClick={() => toggleSort("attempts")}
                >
                  <span className="inline-flex items-center justify-center">Attempts <SortIcon col="attempts" /></span>
                </th>
                <th
                  className="text-right px-5 py-3 text-xs font-mono font-medium text-muted-foreground uppercase tracking-wider cursor-pointer select-none hover:text-foreground transition-colors"
                  onClick={() => toggleSort("updatedAt")}
                >
                  <span className="inline-flex items-center justify-end">Updated <SortIcon col="updatedAt" /></span>
                </th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((job) => (
                <tr
                  key={job.id}
                  onClick={() => navigate(`/jobs/${job.id}`)}
                  className="border-b border-border hover:bg-surface-1 transition-colors cursor-pointer"
                >
                  <td className="px-5 py-3">
                    <StatusBadge variant={jobStatusVariant(job.status)} dot pulse={job.status === "running"}>
                      {job.status}
                    </StatusBadge>
                  </td>
                  <td className="px-5 py-3 font-mono text-sm text-cordum">{job.id.slice(0, 16)}</td>
                  <td className="px-5 py-3 text-sm text-foreground">{job.topic || "—"}</td>
                  <td className="px-5 py-3">
                    {job.safetyDecision ? (
                      <StatusBadge variant={safetyVariant(job.safetyDecision.type)}>
                        {job.safetyDecision.type}
                      </StatusBadge>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-center font-mono text-xs text-muted-foreground">{job.attempts ?? 0}</td>
                  <td className="px-5 py-3 text-right text-xs text-muted-foreground font-mono">
                    {job.updatedAt ? formatRelativeTime(new Date(job.updatedAt).toISOString()) : "—"}
                  </td>
                  <td className="px-5 py-3">
                    <button className="p-1 rounded hover:bg-surface-2 transition-colors">
                      <Eye className="w-3.5 h-3.5 text-muted-foreground" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {/* Table footer with count */}
          <div className="flex items-center justify-between px-5 py-3 border-t border-border bg-surface-0">
            <span className="text-xs font-mono text-muted-foreground">
              Showing {filtered.length} of {jobs.length} jobs
            </span>
            <span className="text-[10px] font-mono text-muted-foreground">
              Sorted by {sortKey} ({sortDir})
            </span>
          </div>
        </motion.div>
      )}
    </div>
  );
}
