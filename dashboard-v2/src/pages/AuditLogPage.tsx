import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { get } from "@/api/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { InstrumentCard, InstrumentCardHeader, InstrumentCardBody } from "@/components/ui/InstrumentCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { DataTable } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonTable } from "@/components/ui/Skeleton";
import { Search, RefreshCw, FileText, Download, Filter } from "lucide-react";
import { formatRelativeTime } from "@/lib/utils";

interface AuditEvent {
  id: string;
  action: string;
  actor: string;
  resource: string;
  resourceId?: string;
  detail?: string;
  timestamp: string;
  ip?: string;
}

export default function AuditLogPage() {
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("");

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["audit", actionFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: "200" });
      if (actionFilter) params.set("action", actionFilter);
      const res = await get<{ items: AuditEvent[] }>(`/audit?${params}`);
      return res.items ?? [];
    },
  });

  const events = (data ?? []).filter((e) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return e.action.toLowerCase().includes(q) || e.actor.toLowerCase().includes(q) || e.resource.toLowerCase().includes(q) || (e.detail ?? "").toLowerCase().includes(q);
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit Log"
        subtitle="System-wide activity trail"
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => refetch()}>
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </Button>
            <Button variant="secondary" size="sm">
              <Download className="w-3.5 h-3.5" /> Export
            </Button>
          </div>
        }
      />

      <div className="flex items-center gap-3">
        <Input
          icon={<Search className="w-3.5 h-3.5" />}
          placeholder="Search events…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <Select
          options={[
            { value: "", label: "All Actions" },
            { value: "job.created", label: "Job Created" },
            { value: "job.completed", label: "Job Completed" },
            { value: "job.failed", label: "Job Failed" },
            { value: "approval.decided", label: "Approval Decided" },
            { value: "policy.updated", label: "Policy Updated" },
            { value: "worker.registered", label: "Worker Registered" },
          ]}
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="w-48"
        />
      </div>

      <InstrumentCard>
        <InstrumentCardBody className="p-0">
          {isLoading ? (
            <div className="p-5"><SkeletonTable rows={10} /></div>
          ) : events.length === 0 ? (
            <EmptyState icon={<FileText className="w-5 h-5" />} title="No audit events" description="Events will appear as actions occur in the system" />
          ) : (
            <DataTable
              columns={[
                {
                  key: "time",
                  header: "Time",
                  width: "140px",
                  render: (e) => <span className="text-xs font-mono text-muted-foreground">{formatRelativeTime(e.timestamp)}</span>,
                },
                {
                  key: "action",
                  header: "Action",
                  width: "160px",
                  render: (e) => <span className="text-xs font-mono px-2 py-0.5 rounded bg-surface-2 text-foreground">{e.action}</span>,
                },
                {
                  key: "actor",
                  header: "Actor",
                  width: "120px",
                  render: (e) => <span className="text-sm text-foreground">{e.actor}</span>,
                },
                {
                  key: "resource",
                  header: "Resource",
                  render: (e) => (
                    <div>
                      <span className="text-sm text-foreground">{e.resource}</span>
                      {e.resourceId && <span className="text-xs text-muted-foreground font-mono ml-1">({e.resourceId.slice(0, 12)})</span>}
                    </div>
                  ),
                },
                {
                  key: "detail",
                  header: "Detail",
                  render: (e) => <span className="text-xs text-muted-foreground truncate max-w-[200px] block">{e.detail ?? "—"}</span>,
                },
              ]}
              data={events}
              keyExtractor={(e) => e.id}
            />
          )}
        </InstrumentCardBody>
      </InstrumentCard>
    </div>
  );
}
