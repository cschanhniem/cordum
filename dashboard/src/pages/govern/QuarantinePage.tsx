import { useMemo } from "react";
import { AlertTriangle, ShieldAlert } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonCard } from "@/components/ui/Skeleton";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useQuarantinedJobs } from "@/hooks/useOutputPolicy";
import { usePolicyAccess } from "@/hooks/usePolicyAccess";
import { formatRelativeTime } from "@/lib/utils";

function getDecisionVariant(decision?: string): "danger" | "warning" | "info" {
  const normalized = (decision ?? "").toUpperCase();
  if (normalized === "DENY") return "danger";
  if (normalized === "QUARANTINE") return "warning";
  return "info";
}

export default function QuarantinePage() {
  const policyAccess = usePolicyAccess();
  const { data, isLoading, isError, error, refetch } = useQuarantinedJobs();

  const items = useMemo(() => data?.items ?? [], [data]);
  const highSeverityCount = useMemo(
    () =>
      items.filter((item) =>
        (item.output_safety?.findings ?? []).some(
          (finding) => finding.severity === "critical" || finding.severity === "high",
        ),
      ).length,
    [items],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        label="Govern"
        title="Quarantine"
        subtitle="Review quarantined outputs flagged by policy scanners. Release or deny items based on severity findings."
        actions={
          <StatusBadge variant={policyAccess.canRelease ? "healthy" : "muted"}>
            {policyAccess.canRelease ? "release access" : "release restricted"}
          </StatusBadge>
        }
      />

      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      )}

      {isError && (
        <EmptyState
          icon={<AlertTriangle className="w-6 h-6" />}
          title="Unable to load quarantine queue"
          description={error instanceof Error ? error.message : "An unexpected error occurred while loading quarantine data."}
          action={
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              Retry
            </Button>
          }
        />
      )}

      {!isLoading && !isError && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="instrument-card p-4">
              <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-2">Queue size</p>
              <p className="text-2xl font-mono font-bold text-foreground">{items.length}</p>
            </div>
            <div className="instrument-card p-4">
              <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-2">High severity findings</p>
              <p className="text-2xl font-mono font-bold text-foreground">{highSeverityCount}</p>
            </div>
            <div className="instrument-card p-4">
              <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-2">Review mode</p>
              <p className="text-2xl font-mono font-bold text-foreground">read-only</p>
            </div>
          </div>

          {items.length === 0 ? (
            <EmptyState
              icon={<ShieldAlert className="w-6 h-6" />}
              title="No quarantined outputs"
              description="No output items are currently quarantined."
            />
          ) : (
            <div className="instrument-card p-0 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                  Showing {Math.min(12, items.length)} of {items.length} queued items
                </p>
              </div>
              <div className="divide-y divide-border">
                {items.slice(0, 12).map((item) => (
                  <div key={item.id} className="px-4 py-3 flex flex-col md:flex-row md:items-center gap-2 md:gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-mono text-foreground truncate">{item.id}</p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {item.output_safety?.reason?.trim() || "Output quarantined by policy scanners"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <StatusBadge variant={getDecisionVariant(item.output_safety?.decision)}>
                        {(item.output_safety?.decision ?? "unknown").toLowerCase()}
                      </StatusBadge>
                      <StatusBadge variant="muted">{formatRelativeTime(item.updatedAt)}</StatusBadge>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
