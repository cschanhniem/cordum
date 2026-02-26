/*
 * DESIGN: "Control Surface" — System Health
 * PRD Section 29: Service health table + resource charts
 */
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { get } from "@/api/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { SkeletonCard, SkeletonTable } from "@/components/ui/Skeleton";
import { Activity, Server, Database, Wifi, Clock, Cpu, HardDrive, MemoryStick } from "lucide-react";
import { cn } from "@/lib/utils";

interface ServiceHealth {
  name: string;
  status: "healthy" | "degraded" | "down";
  latency: string;
  uptime: string;
  lastCheck: string;
}

export default function SettingsHealthPage() {
  const { data: health, isLoading } = useQuery({
    queryKey: ["health"],
    queryFn: async () => {
      const res: any = await get("/health");
      return res.data as { services: ServiceHealth[]; cpu: number; memory: number; disk: number };
    },
    refetchInterval: 10000,
  });

  const services = health?.services || [];
  const serviceIcon = (name: string) => {
    if (name.includes("API")) return Server;
    if (name.includes("Database") || name.includes("DB")) return Database;
    if (name.includes("Queue") || name.includes("Redis")) return Wifi;
    return Activity;
  };

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <PageHeader title="System Health" subtitle="Monitor service status and resource utilization" />

      {/* Resource Gauges */}
      {isLoading ? (
        <div className="grid grid-cols-3 gap-4">{Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { label: "CPU", value: health?.cpu || 0, icon: Cpu, color: "cordum" },
            { label: "Memory", value: health?.memory || 0, icon: MemoryStick, color: "blue-400" },
            { label: "Disk", value: health?.disk || 0, icon: HardDrive, color: "amber-400" },
          ].map((gauge, i) => {
            const Icon = gauge.icon;
            const isHigh = gauge.value > 80;
            return (
              <motion.div key={gauge.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                className="instrument-card p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Icon className={cn("w-4 h-4", `text-${gauge.color}`)} />
                    <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">{gauge.label}</span>
                  </div>
                  <span className={cn("text-lg font-mono font-bold", isHigh ? "text-red-400" : "text-foreground")}>{gauge.value}%</span>
                </div>
                <div className="h-2 rounded-full bg-surface-2 overflow-hidden">
                  <motion.div
                    className={cn("h-full rounded-full", isHigh ? "bg-red-400" : `bg-${gauge.color}`)}
                    initial={{ width: 0 }}
                    animate={{ width: `${gauge.value}%` }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                  />
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Services Table */}
      {isLoading ? <SkeletonTable rows={5} /> : (
        <div className="instrument-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-surface-0">
            <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Service Status</p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-0">
                <th className="text-left px-4 py-3 text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Service</th>
                <th className="text-left px-4 py-3 text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="text-left px-4 py-3 text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Latency</th>
                <th className="text-left px-4 py-3 text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Uptime</th>
                <th className="text-left px-4 py-3 text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Last Check</th>
              </tr>
            </thead>
            <tbody>
              {services.map((svc, i) => {
                const Icon = serviceIcon(svc.name);
                return (
                  <motion.tr key={svc.name} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}
                    className="border-b border-border last:border-0 hover:bg-surface-1 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="font-medium text-foreground">{svc.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3"><StatusBadge variant={svc.status === "healthy" ? "healthy" : svc.status === "degraded" ? "warning" : "danger"} dot>{svc.status}</StatusBadge></td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{svc.latency}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{svc.uptime}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{svc.lastCheck}</td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </motion.div>
  );
}
