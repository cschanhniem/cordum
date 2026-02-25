/*
 * DESIGN: "Control Surface" — Output Safety
 * PRD Section 36: Output quarantine queue and sensitive data settings
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { get, post } from "@/api/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonTable, SkeletonCard } from "@/components/ui/Skeleton";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ShieldAlert, CheckCircle2, XCircle, Eye, Search, RefreshCw, AlertTriangle, Save } from "lucide-react";
import { cn, formatRelativeTime } from "@/lib/utils";
import { toast } from "sonner";

interface QuarantinedOutput {
  id: string;
  jobId: string;
  reason: string;
  severity: "high" | "medium" | "low";
  detectedAt: string;
  preview: string;
}

export default function OutputSafetyPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("quarantine");
  const [selectedItem, setSelectedItem] = useState<QuarantinedOutput | null>(null);
  const [releaseTarget, setReleaseTarget] = useState<QuarantinedOutput | null>(null);
  const [sensitiveDataEnabled, setSensitiveDataEnabled] = useState(true);
  const [autoQuarantine, setAutoQuarantine] = useState(true);

  const { data: quarantined, isLoading } = useQuery({
    queryKey: ["output-quarantine"],
    queryFn: async () => {
      const res: any = await get("/api/safety/output/quarantine");
      return (res.data || []) as QuarantinedOutput[];
    },
  });

  const releaseMutation = useMutation({
    mutationFn: async (id: string) => post(`/api/safety/output/quarantine/${id}/release`, {}),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["output-quarantine"] }); toast.success("Output released"); setReleaseTarget(null); },
  });

  const discardMutation = useMutation({
    mutationFn: async (id: string) => post(`/api/safety/output/quarantine/${id}/discard`, {}),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["output-quarantine"] }); toast.success("Output discarded"); },
  });

  const tabs = ["quarantine", "settings"];
  const severityColor = (s: string) => s === "high" ? "danger" : s === "medium" ? "warning" : "info";

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <PageHeader title="Output Safety" subtitle="Review quarantined outputs and configure detection settings" />

      <div className="flex items-center gap-1 p-1 rounded-lg bg-surface-1 w-fit">
        {tabs.map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={cn("px-4 py-1.5 text-xs font-medium rounded-md transition-colors capitalize",
              activeTab === tab ? "bg-cordum/10 text-cordum" : "text-muted-foreground hover:text-foreground")}>
            {tab}
          </button>
        ))}
      </div>

      {/* Quarantine Tab */}
      {activeTab === "quarantine" && (
        isLoading ? <SkeletonTable rows={5} /> :
        !quarantined?.length ? <EmptyState icon={<ShieldAlert className="w-8 h-8" />} title="Quarantine empty" description="No outputs flagged by safety checks" /> : (
          <div className="instrument-card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-0">
                  <th className="text-left px-4 py-3 text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Job</th>
                  <th className="text-left px-4 py-3 text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Reason</th>
                  <th className="text-left px-4 py-3 text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Severity</th>
                  <th className="text-left px-4 py-3 text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Detected</th>
                  <th className="text-right px-4 py-3 text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody>
                {quarantined.map((item, i) => (
                  <motion.tr key={item.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}
                    className="border-b border-border last:border-0 hover:bg-surface-1 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-foreground">{item.jobId.slice(0, 8)}</td>
                    <td className="px-4 py-3 text-xs text-foreground">{item.reason}</td>
                    <td className="px-4 py-3"><StatusBadge variant={severityColor(item.severity) as any}>{item.severity}</StatusBadge></td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{formatRelativeTime(item.detectedAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => setSelectedItem(item)} className="p-1.5 rounded hover:bg-surface-2 transition-colors">
                          <Eye className="w-3.5 h-3.5 text-muted-foreground" />
                        </button>
                        <button onClick={() => setReleaseTarget(item)} className="p-1.5 rounded hover:bg-emerald-500/10 transition-colors">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        </button>
                        <button onClick={() => discardMutation.mutate(item.id)} className="p-1.5 rounded hover:bg-red-500/10 transition-colors">
                          <XCircle className="w-3.5 h-3.5 text-red-400" />
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* Settings Tab */}
      {activeTab === "settings" && (
        <div className="space-y-4">
          <div className="instrument-card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Sensitive Data Detection</p>
                <p className="text-xs text-muted-foreground">Scan outputs for PII, credentials, and sensitive data</p>
              </div>
              <button onClick={() => setSensitiveDataEnabled(!sensitiveDataEnabled)}
                className={cn("w-9 h-5 rounded-full relative transition-colors", sensitiveDataEnabled ? "bg-cordum" : "bg-surface-2")}>
                <div className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform", sensitiveDataEnabled ? "left-[18px]" : "left-0.5")} />
              </button>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Auto-Quarantine</p>
                <p className="text-xs text-muted-foreground">Automatically quarantine flagged outputs instead of blocking</p>
              </div>
              <button onClick={() => setAutoQuarantine(!autoQuarantine)}
                className={cn("w-9 h-5 rounded-full relative transition-colors", autoQuarantine ? "bg-cordum" : "bg-surface-2")}>
                <div className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform", autoQuarantine ? "left-[18px]" : "left-0.5")} />
              </button>
            </div>
          </div>
          <Button variant="primary" size="sm" onClick={() => toast.success("Settings saved")}>
            <Save className="w-3 h-3 mr-1" />Save Settings
          </Button>
        </div>
      )}

      {/* Release Confirmation */}
      <ConfirmDialog open={!!releaseTarget} onClose={() => setReleaseTarget(null)}
        onConfirm={() => releaseTarget && releaseMutation.mutate(releaseTarget.id)}
        title="Release Output" description="This will release the quarantined output and deliver it to the requesting agent. Are you sure?"
        confirmLabel="Release" variant="default" />
    </motion.div>
  );
}
