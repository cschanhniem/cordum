import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, post } from "@/api/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { InstrumentCard, InstrumentCardHeader, InstrumentCardBody } from "@/components/ui/InstrumentCard";
import { MetricValue } from "@/components/ui/MetricValue";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { DataTable } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonCard, SkeletonTable } from "@/components/ui/Skeleton";
import { Search, RefreshCw, AlertTriangle, Play, Trash2, CheckCircle2 } from "lucide-react";
import { formatRelativeTime } from "@/lib/utils";
import { toast } from "sonner";

interface DLQItem {
  id: string;
  jobId: string;
  topic?: string;
  error?: string;
  attempts: number;
  failedAt: string;
  payload?: any;
}

export default function DLQPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["dlq"],
    queryFn: async () => {
      const res = await get<{ items: DLQItem[]; total?: number }>("/dlq?limit=200");
      return { items: res.items ?? [], total: res.total ?? (res.items ?? []).length };
    },
    refetchInterval: 15_000,
  });

  const retryMutation = useMutation({
    mutationFn: async (id: string) => { await post(`/dlq/${id}/retry`, {}); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["dlq"] }); toast.success("Retry queued"); },
    onError: () => toast.error("Retry failed"),
  });

  const purgeMutation = useMutation({
    mutationFn: async (id: string) => { await post(`/dlq/${id}/purge`, {}); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["dlq"] }); toast.success("Purged"); },
    onError: () => toast.error("Purge failed"),
  });

  const items = (data?.items ?? []).filter((d) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return d.jobId.toLowerCase().includes(q) || (d.topic ?? "").toLowerCase().includes(q) || (d.error ?? "").toLowerCase().includes(q);
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dead Letter Queue"
        subtitle="Failed messages requiring attention"
        actions={
          <Button variant="secondary" size="sm" onClick={() => refetch()}>
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-4">
        {isLoading ? (
          Array.from({ length: 2 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            <InstrumentCard accent={items.length > 0 ? "danger" : "healthy"}>
              <InstrumentCardBody className="pt-4">
                <MetricValue label="Dead Letters" value={data?.total ?? 0} />
              </InstrumentCardBody>
            </InstrumentCard>
            <InstrumentCard accent="muted">
              <InstrumentCardBody className="pt-4">
                <MetricValue label="Avg Attempts" value={items.length > 0 ? (items.reduce((s, i) => s + i.attempts, 0) / items.length).toFixed(1) : "0"} />
              </InstrumentCardBody>
            </InstrumentCard>
          </>
        )}
      </div>

      <Input
        icon={<Search className="w-3.5 h-3.5" />}
        placeholder="Search by job ID, topic, or error…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />

      <InstrumentCard accent={items.length > 0 ? "danger" : "healthy"}>
        <InstrumentCardBody className="p-0">
          {isLoading ? (
            <div className="p-5"><SkeletonTable rows={6} /></div>
          ) : items.length === 0 ? (
            <EmptyState
              icon={<CheckCircle2 className="w-5 h-5" />}
              title="DLQ is empty"
              description="No failed messages — all systems healthy"
            />
          ) : (
            <DataTable
              columns={[
                {
                  key: "jobId",
                  header: "Job ID",
                  render: (d) => <span className="font-mono text-xs text-foreground">{d.jobId.slice(0, 16)}</span>,
                },
                {
                  key: "topic",
                  header: "Topic",
                  render: (d) => <span className="text-sm text-foreground">{d.topic ?? "—"}</span>,
                },
                {
                  key: "error",
                  header: "Error",
                  render: (d) => <span className="text-xs text-status-danger truncate max-w-[250px] block font-mono">{d.error ?? "—"}</span>,
                },
                {
                  key: "attempts",
                  header: "Attempts",
                  width: "80px",
                  align: "center",
                  render: (d) => <span className="text-xs font-mono text-muted-foreground">{d.attempts}</span>,
                },
                {
                  key: "failedAt",
                  header: "Failed",
                  width: "120px",
                  render: (d) => <span className="text-xs text-muted-foreground font-mono">{formatRelativeTime(d.failedAt)}</span>,
                },
                {
                  key: "actions",
                  header: "",
                  width: "100px",
                  align: "right",
                  render: (d) => (
                    <div className="flex gap-1 justify-end">
                      <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); retryMutation.mutate(d.id); }}>
                        <Play className="w-3 h-3" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); purgeMutation.mutate(d.id); }}>
                        <Trash2 className="w-3 h-3 text-status-danger" />
                      </Button>
                    </div>
                  ),
                },
              ]}
              data={items}
              keyExtractor={(d) => d.id}
            />
          )}
        </InstrumentCardBody>
      </InstrumentCard>
    </div>
  );
}
