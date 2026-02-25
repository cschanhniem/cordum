import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, post } from "@/api/client";
import { mapApprovalItem, type BackendApprovalItem } from "@/api/transform";
import type { Approval } from "@/api/types";
import { PageHeader } from "@/components/layout/PageHeader";
import { InstrumentCard, InstrumentCardHeader, InstrumentCardBody } from "@/components/ui/InstrumentCard";
import { MetricValue } from "@/components/ui/MetricValue";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Tabs } from "@/components/ui/Tabs";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonCard, SkeletonTable } from "@/components/ui/Skeleton";
import { Search, RefreshCw, UserCheck, CheckCircle2, XCircle, Shield, Clock, AlertTriangle } from "lucide-react";
import { cn, formatRelativeTime } from "@/lib/utils";
import { toast } from "sonner";

function approvalStatusVariant(status: string) {
  switch (status) {
    case "pending": return "warning" as const;
    case "approved": return "healthy" as const;
    case "denied": return "danger" as const;
    case "expired": return "muted" as const;
    default: return "muted" as const;
  }
}

export default function ApprovalsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("pending");
  const [selectedApproval, setSelectedApproval] = useState<Approval | null>(null);

  const { data: approvals, isLoading, refetch } = useQuery({
    queryKey: ["approvals"],
    queryFn: async () => {
      const res = await get<{ items: BackendApprovalItem[] }>("/approvals?limit=500");
      return (res.items ?? []).map(mapApprovalItem).filter((a): a is Approval => !!a);
    },
    refetchInterval: 5_000,
  });

  const approveMutation = useMutation({
    mutationFn: async ({ id, decision, reason }: { id: string; decision: "approve" | "deny"; reason?: string }) => {
      await post(`/approvals/${id}/${decision}`, { reason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["approvals"] });
      toast.success("Decision recorded");
      setSelectedApproval(null);
    },
    onError: () => toast.error("Failed to record decision"),
  });

  const all = approvals ?? [];
  const pending = all.filter((a) => a.status === "pending");
  const approved = all.filter((a) => a.status === "approved");
  const denied = all.filter((a) => a.status === "denied");

  const tabs = [
    { id: "pending", label: "Pending", count: pending.length },
    { id: "approved", label: "Approved", count: approved.length },
    { id: "denied", label: "Denied", count: denied.length },
    { id: "all", label: "All", count: all.length },
  ];

  const filtered = all
    .filter((a) => {
      if (activeTab !== "all" && a.status !== activeTab) return false;
      if (search) {
        const q = search.toLowerCase();
        return a.id.toLowerCase().includes(q) || (a.topic ?? "").toLowerCase().includes(q) || (a.jobId ?? "").toLowerCase().includes(q);
      }
      return true;
    })
    .sort((a, b) => {
      if (a.status === "pending" && b.status !== "pending") return -1;
      if (b.status === "pending" && a.status !== "pending") return 1;
      return new Date(b.requestedAt ?? 0).getTime() - new Date(a.requestedAt ?? 0).getTime();
    });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Approvals"
        subtitle="Human-in-the-loop review queue"
        actions={
          <Button variant="secondary" size="sm" onClick={() => refetch()}>
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </Button>
        }
      />

      {/* KPI Row */}
      <div className="grid grid-cols-3 gap-4">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            <InstrumentCard accent={pending.length > 0 ? "warning" : "healthy"}>
              <InstrumentCardBody className="pt-4">
                <MetricValue label="Pending" value={pending.length} />
              </InstrumentCardBody>
            </InstrumentCard>
            <InstrumentCard accent="healthy">
              <InstrumentCardBody className="pt-4">
                <MetricValue label="Approved" value={approved.length} />
              </InstrumentCardBody>
            </InstrumentCard>
            <InstrumentCard accent={denied.length > 0 ? "danger" : "muted"}>
              <InstrumentCardBody className="pt-4">
                <MetricValue label="Denied" value={denied.length} />
              </InstrumentCardBody>
            </InstrumentCard>
          </>
        )}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <Input
          icon={<Search className="w-3.5 h-3.5" />}
          placeholder="Search by ID, topic, or job…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} className="ml-auto border-none" />
      </div>

      {/* Approval Cards */}
      {isLoading ? (
        <SkeletonTable rows={5} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<UserCheck className="w-5 h-5" />}
          title={activeTab === "pending" ? "No pending approvals" : "No approvals found"}
          description={activeTab === "pending" ? "All clear — no actions waiting for review" : "Try adjusting your search or filters"}
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((approval) => (
            <InstrumentCard
              key={approval.id}
              accent={approvalStatusVariant(approval.status)}
              hoverable
              onClick={() => setSelectedApproval(approval)}
            >
              <InstrumentCardBody className="py-4">
                <div className="flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <StatusBadge variant={approvalStatusVariant(approval.status)} dot pulse={approval.status === "pending"}>
                        {approval.status}
                      </StatusBadge>
                      <span className="text-xs font-mono text-muted-foreground">{approval.id.slice(0, 16)}</span>
                    </div>
                    <p className="text-sm font-medium text-foreground">{approval.topic || "Approval Request"}</p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      {approval.jobId && <span className="font-mono">Job: {approval.jobId.slice(0, 12)}</span>}
                      {approval.requestedAt && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatRelativeTime(approval.requestedAt)}
                        </span>
                      )}
                    </div>
                  </div>
                  {approval.status === "pending" && (
                    <div className="flex gap-2 shrink-0">
                      <Button
                        variant="primary"
                        size="sm"
                        loading={approveMutation.isPending}
                        onClick={(e) => {
                          e.stopPropagation();
                          approveMutation.mutate({ id: approval.id, decision: "approve" });
                        }}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Approve
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        loading={approveMutation.isPending}
                        onClick={(e) => {
                          e.stopPropagation();
                          approveMutation.mutate({ id: approval.id, decision: "deny" });
                        }}
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        Deny
                      </Button>
                    </div>
                  )}
                </div>
              </InstrumentCardBody>
            </InstrumentCard>
          ))}
        </div>
      )}

      {/* Detail Drawer */}
      {selectedApproval && (
        <div className="fixed inset-y-0 right-0 w-[440px] bg-card border-l border-border shadow-2xl z-50 overflow-y-auto">
          <div className="p-5 border-b border-border flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold font-display">Approval Detail</h2>
              <p className="text-xs text-muted-foreground font-mono mt-0.5">{selectedApproval.id}</p>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setSelectedApproval(null)}>✕</Button>
          </div>
          <div className="p-5 space-y-4">
            <StatusBadge variant={approvalStatusVariant(selectedApproval.status)} dot>
              {selectedApproval.status}
            </StatusBadge>
            <dl className="space-y-3">
              {[
                ["Topic", selectedApproval.topic],
                ["Job ID", selectedApproval.jobId],
                ["Requested", selectedApproval.requestedAt ? formatRelativeTime(selectedApproval.requestedAt) : "—"],
                ["Decided By", selectedApproval.actor],
                ["Reason", selectedApproval.reason],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">{label}</dt>
                  <dd className="text-sm text-foreground font-mono">{value || "—"}</dd>
                </div>
              ))}
            </dl>
            {selectedApproval.jobContext && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Context</p>
                <div className="rounded-md bg-surface-2/50 border border-border p-3 font-mono text-xs text-foreground overflow-auto max-h-[200px]">
                  <pre>{JSON.stringify(selectedApproval.jobContext, null, 2)}</pre>
                </div>
              </div>
            )}
            {selectedApproval.status === "pending" && (
              <div className="flex gap-2 pt-2">
                <Button
                  variant="primary"
                  className="flex-1"
                  loading={approveMutation.isPending}
                  onClick={() => approveMutation.mutate({ id: selectedApproval.id, decision: "approve" })}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Approve
                </Button>
                <Button
                  variant="danger"
                  className="flex-1"
                  loading={approveMutation.isPending}
                  onClick={() => approveMutation.mutate({ id: selectedApproval.id, decision: "deny" })}
                >
                  <XCircle className="w-3.5 h-3.5" />
                  Deny
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
