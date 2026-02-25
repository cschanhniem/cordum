import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { get } from "@/api/client";
import { mapHeartbeatToWorker, type BackendHeartbeat } from "@/api/transform";
import type { Worker } from "@/api/types";
import { PageHeader } from "@/components/layout/PageHeader";
import { InstrumentCard, InstrumentCardHeader, InstrumentCardBody } from "@/components/ui/InstrumentCard";
import { MetricValue } from "@/components/ui/MetricValue";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Tabs } from "@/components/ui/Tabs";
import { DataTable } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonCard, SkeletonTable } from "@/components/ui/Skeleton";
import {
  Cpu, Search, RefreshCw, Activity, Clock, Wifi, WifiOff, Zap,
  MemoryStick, HardDrive, ChevronRight,
} from "lucide-react";
import { cn, formatRelativeTime, formatDuration } from "@/lib/utils";

function workerStatusVariant(status: string) {
  switch (status) {
    case "idle": return "healthy" as const;
    case "busy": return "info" as const;
    case "draining": return "warning" as const;
    case "offline": return "danger" as const;
    default: return "muted" as const;
  }
}

export default function AgentsPage() {
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [selectedWorker, setSelectedWorker] = useState<Worker | null>(null);

  const { data: workers, isLoading, refetch } = useQuery({
    queryKey: ["workers"],
    queryFn: async () => {
      const res = await get<BackendHeartbeat[]>("/workers");
      return (res ?? []).map(mapHeartbeatToWorker).filter((w): w is Worker => !!w);
    },
    refetchInterval: 15_000,
  });

  const allWorkers = workers ?? [];
  const idleCount = allWorkers.filter((w) => w.status === "idle").length;
  const busyCount = allWorkers.filter((w) => w.status === "busy").length;
  const offlineCount = allWorkers.filter((w) => w.status === "offline").length;

  const tabs = [
    { id: "all", label: "All", count: allWorkers.length },
    { id: "idle", label: "Idle", count: idleCount },
    { id: "busy", label: "Busy", count: busyCount },
    { id: "offline", label: "Offline", count: offlineCount },
  ];

  const filtered = allWorkers
    .filter((w) => {
      if (activeTab !== "all" && w.status !== activeTab) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          w.id.toLowerCase().includes(q) ||
          (w.pool ?? "").toLowerCase().includes(q) ||
          w.capabilities?.some((t: string) => t.toLowerCase().includes(q))
        );
      }
      return true;
    });

  // Group by pool
  const pools = new Map<string, Worker[]>();
  for (const w of filtered) {
    const pool = w.pool || "default";
    if (!pools.has(pool)) pools.set(pool, []);
    pools.get(pool)!.push(w);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Agent Fleet"
        subtitle="Monitor and manage worker agents"
        actions={
          <Button variant="secondary" size="sm" onClick={() => refetch()}>
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </Button>
        }
      />

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            <InstrumentCard accent="cordum">
              <InstrumentCardBody className="pt-4">
                <MetricValue label="Total Agents" value={allWorkers.length} />
              </InstrumentCardBody>
            </InstrumentCard>
            <InstrumentCard accent="healthy">
              <InstrumentCardBody className="pt-4">
                <MetricValue label="Idle" value={idleCount} />
              </InstrumentCardBody>
            </InstrumentCard>
            <InstrumentCard accent="info">
              <InstrumentCardBody className="pt-4">
                <MetricValue label="Busy" value={busyCount} />
              </InstrumentCardBody>
            </InstrumentCard>
            <InstrumentCard accent={offlineCount > 0 ? "danger" : "muted"}>
              <InstrumentCardBody className="pt-4">
                <MetricValue label="Offline" value={offlineCount} />
              </InstrumentCardBody>
            </InstrumentCard>
          </>
        )}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <Input
          icon={<Search className="w-3.5 h-3.5" />}
          placeholder="Search agents by ID, pool, or topic…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} className="ml-auto border-none" />
      </div>

      {/* Pool Groups */}
      {isLoading ? (
        <SkeletonTable rows={6} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Cpu className="w-5 h-5" />}
          title="No agents found"
          description={search ? "Try adjusting your search" : "No agents have connected yet"}
        />
      ) : (
        <div className="space-y-6">
          {Array.from(pools.entries()).map(([pool, poolWorkers]) => (
            <InstrumentCard key={pool}>
              <InstrumentCardHeader
                title={pool}
                subtitle={`${poolWorkers.length} agent${poolWorkers.length !== 1 ? "s" : ""}`}
                icon={<Cpu className="w-4 h-4" />}
                action={
                  <div className="flex gap-1.5">
                    <StatusBadge variant="healthy" dot>{poolWorkers.filter(w => w.status === "idle").length} idle</StatusBadge>
                    <StatusBadge variant="info" dot>{poolWorkers.filter(w => w.status === "busy").length} busy</StatusBadge>
                  </div>
                }
              />
              <InstrumentCardBody className="p-0">
                <DataTable
                  columns={[
                    {
                      key: "status",
                      header: "Status",
                      width: "80px",
                      render: (w) => (
                        <StatusBadge variant={workerStatusVariant(w.status)} dot pulse={w.status === "busy"}>
                          {w.status}
                        </StatusBadge>
                      ),
                    },
                    {
                      key: "id",
                      header: "Agent ID",
                      render: (w) => (
                        <span className="font-mono text-xs text-foreground">{w.id.slice(0, 16)}</span>
                      ),
                    },
                    {
                      key: "capabilities",
                      header: "Capabilities",
                      render: (w) => (
                        <div className="flex flex-wrap gap-1">
                          {(w.capabilities ?? []).slice(0, 3).map((t: string) => (
                            <span key={t} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-surface-2 text-muted-foreground">
                              {t}
                            </span>
                          ))}
                          {(w.capabilities?.length ?? 0) > 3 && (
                            <span className="text-[10px] text-muted-foreground">+{w.capabilities!.length - 3}</span>
                          )}
                        </div>
                      ),
                    },
                    {
                      key: "activeJobs",
                      header: "Active Jobs",
                      width: "100px",
                      align: "center" as const,
                      render: (w) => (
                        <span className={cn("font-mono text-xs", w.activeJobs > 0 ? "text-cordum" : "text-muted-foreground")}>
                          {w.activeJobs} / {w.capacity}
                        </span>
                      ),
                    },
                    {
                      key: "lastSeen",
                      header: "Last Seen",
                      align: "right",
                      render: (w) => (
                        <span className="text-xs text-muted-foreground font-mono">
                          {w.lastHeartbeat ? formatRelativeTime(w.lastHeartbeat) : "—"}
                        </span>
                      ),
                    },
                  ]}
                  data={poolWorkers}
                  keyExtractor={(w) => w.id}
                  onRowClick={(w) => setSelectedWorker(w)}
                />
              </InstrumentCardBody>
            </InstrumentCard>
          ))}
        </div>
      )}

      {/* Worker Detail Drawer (simplified inline) */}
      {selectedWorker && (
        <div className="fixed inset-y-0 right-0 w-[400px] bg-card border-l border-border shadow-2xl z-50 overflow-y-auto">
          <div className="p-5 border-b border-border flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold font-display">Agent Detail</h2>
              <p className="text-xs text-muted-foreground font-mono mt-0.5">{selectedWorker.id.slice(0, 20)}</p>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setSelectedWorker(null)}>
              ✕
            </Button>
          </div>
          <div className="p-5 space-y-4">
            <div className="flex items-center gap-2">
              <StatusBadge variant={workerStatusVariant(selectedWorker.status)} dot pulse={selectedWorker.status === "busy"}>
                {selectedWorker.status}
              </StatusBadge>
              <span className="text-xs text-muted-foreground">Pool: {selectedWorker.pool || "default"}</span>
            </div>
            <div className="space-y-3">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Capabilities</p>
                <div className="flex flex-wrap gap-1">
                  {(selectedWorker.capabilities ?? []).map((t: string) => (
                    <span key={t} className="text-xs font-mono px-2 py-0.5 rounded bg-surface-2 text-foreground">{t}</span>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Active Jobs</p>
                <p className="text-sm font-mono text-cordum">{selectedWorker.activeJobs} / {selectedWorker.capacity}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Last Heartbeat</p>
                <p className="text-sm text-foreground">
                  {selectedWorker.lastHeartbeat ? formatRelativeTime(selectedWorker.lastHeartbeat) : "—"}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
