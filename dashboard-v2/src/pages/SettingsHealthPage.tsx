/*
 * DESIGN: "Control Surface" — Settings: System Health
 * PRD Section 28: System health monitoring
 */
import { motion } from "framer-motion";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  Activity, Database, Server, Wifi, Clock, HardDrive,
} from "lucide-react";
import { cn } from "@/lib/utils";

const SERVICES = [
  { name: "API Server", icon: Server, status: "healthy", latency: "12ms", uptime: "99.99%", version: "2.4.1" },
  { name: "PostgreSQL", icon: Database, status: "healthy", latency: "3ms", uptime: "99.97%", version: "15.2" },
  { name: "Redis", icon: HardDrive, status: "healthy", latency: "1ms", uptime: "100%", version: "7.2" },
  { name: "Worker Pool", icon: Activity, status: "degraded", latency: "—", uptime: "98.5%", version: "—" },
  { name: "WebSocket", icon: Wifi, status: "healthy", latency: "8ms", uptime: "99.95%", version: "—" },
  { name: "Scheduler", icon: Clock, status: "healthy", latency: "—", uptime: "99.99%", version: "1.1.0" },
];

function statusVariant(s: string) {
  if (s === "healthy") return "healthy" as const;
  if (s === "degraded") return "warning" as const;
  return "danger" as const;
}

export default function SettingsHealthPage() {
  return (
    <div className="space-y-6">
      <PageHeader label="Settings" title="System Health" subtitle="Monitor the health of all system components" />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {SERVICES.map((svc, i) => {
          const Icon = svc.icon;
          return (
            <motion.div
              key={svc.name}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className={cn("instrument-card p-5", svc.status === "degraded" && "status-warning", svc.status === "down" && "status-danger")}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Icon className="w-4 h-4 text-cordum" />
                  <span className="font-display font-semibold text-sm text-foreground">{svc.name}</span>
                </div>
                <StatusBadge variant={statusVariant(svc.status)} dot pulse={svc.status === "healthy"}>
                  {svc.status}
                </StatusBadge>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Latency</span>
                  <span className="font-mono text-foreground">{svc.latency}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Uptime</span>
                  <span className="font-mono text-foreground">{svc.uptime}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Version</span>
                  <span className="font-mono text-foreground">{svc.version}</span>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
