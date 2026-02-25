/*
 * DESIGN: "Control Surface" — Policy History
 * PRD Section 20: Timeline with type badges and diff links
 */
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { get } from "@/api/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonCard } from "@/components/ui/Skeleton";
import { History, Plus, Edit, Trash2, ToggleLeft, ToggleRight, Clock, User, GitCommit } from "lucide-react";
import { cn, formatRelativeTime } from "@/lib/utils";

interface HistoryEntry {
  id: string;
  type: "created" | "updated" | "deleted" | "enabled" | "disabled";
  ruleName: string;
  actor: string;
  timestamp: string;
  details?: string;
}

export default function PoliciesHistoryPage() {
  const { data: history, isLoading } = useQuery({
    queryKey: ["policy-history"],
    queryFn: async () => {
      const res: any = await get("/api/policies/history");
      return (res.data || []) as HistoryEntry[];
    },
  });

  const typeIcon = (type: string) => {
    switch (type) {
      case "created": return <Plus className="w-3.5 h-3.5 text-emerald-400" />;
      case "updated": return <Edit className="w-3.5 h-3.5 text-blue-400" />;
      case "deleted": return <Trash2 className="w-3.5 h-3.5 text-red-400" />;
      case "enabled": return <ToggleRight className="w-3.5 h-3.5 text-emerald-400" />;
      case "disabled": return <ToggleLeft className="w-3.5 h-3.5 text-amber-400" />;
      default: return <GitCommit className="w-3.5 h-3.5 text-muted-foreground" />;
    }
  };

  const typeColor = (type: string) => {
    switch (type) {
      case "created": return "healthy";
      case "updated": return "info";
      case "deleted": return "danger";
      case "enabled": return "healthy";
      case "disabled": return "warning";
      default: return "muted";
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <PageHeader title="Policy History" subtitle="Audit trail of all policy changes" />

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}</div>
      ) : !history?.length ? (
        <EmptyState icon={<History className="w-8 h-8" />} title="No history" description="Policy changes will appear here" />
      ) : (
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-[19px] top-0 bottom-0 w-px bg-border" />

          <div className="space-y-3">
            {history.map((entry, i) => (
              <motion.div key={entry.id} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}
                className="relative flex items-start gap-4 pl-10">
                <div className="absolute left-2.5 top-3 w-[14px] h-[14px] rounded-full bg-surface-1 border-2 border-border flex items-center justify-center z-10">
                  <div className={cn("w-1.5 h-1.5 rounded-full",
                    entry.type === "created" || entry.type === "enabled" ? "bg-emerald-400" :
                    entry.type === "deleted" ? "bg-red-400" :
                    entry.type === "disabled" ? "bg-amber-400" : "bg-blue-400")} />
                </div>
                <div className="instrument-card p-4 flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      {typeIcon(entry.type)}
                      <span className="text-sm font-medium text-foreground">{entry.ruleName}</span>
                      <StatusBadge variant={typeColor(entry.type) as any}>{entry.type}</StatusBadge>
                    </div>
                    <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <Clock className="w-3 h-3" />{formatRelativeTime(entry.timestamp)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <User className="w-3 h-3 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">{entry.actor}</span>
                  </div>
                  {entry.details && <p className="text-xs text-muted-foreground mt-1">{entry.details}</p>}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}
