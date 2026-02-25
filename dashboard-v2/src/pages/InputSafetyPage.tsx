/*
 * DESIGN: "Control Surface" — Input Safety
 * PRD Section 35: Input safety configuration with PII/injection detection
 */
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { get, post } from "@/api/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { SkeletonCard } from "@/components/ui/Skeleton";
import { Shield, AlertTriangle, Save, Plus, Trash2, Eye, RotateCcw, Regex } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface SafetyRule {
  id: string;
  name: string;
  type: "pii" | "injection" | "custom";
  pattern?: string;
  enabled: boolean;
  action: "block" | "warn" | "redact";
}

export default function InputSafetyPage() {
  const [failMode, setFailMode] = useState<"block" | "warn" | "log">("block");
  const [rules, setRules] = useState<SafetyRule[]>([
    { id: "1", name: "Email Detection", type: "pii", enabled: true, action: "redact" },
    { id: "2", name: "Phone Numbers", type: "pii", enabled: true, action: "redact" },
    { id: "3", name: "SSN Detection", type: "pii", enabled: true, action: "block" },
    { id: "4", name: "SQL Injection", type: "injection", enabled: true, action: "block" },
    { id: "5", name: "Prompt Injection", type: "injection", enabled: true, action: "block" },
    { id: "6", name: "Custom: API Keys", type: "custom", pattern: "sk-[a-zA-Z0-9]{32,}", enabled: true, action: "block" },
  ]);

  const { isLoading } = useQuery({
    queryKey: ["input-safety"],
    queryFn: async () => {
      const res: any = await get("/api/safety/input");
      return res.data;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => post("/api/safety/input", { failMode, rules }),
    onSuccess: () => toast.success("Input safety settings saved"),
  });

  const toggleRule = (id: string) => {
    setRules(prev => prev.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r));
  };

  const removeRule = (id: string) => {
    setRules(prev => prev.filter(r => r.id !== id));
  };

  const typeColor = (type: string) => {
    switch (type) {
      case "pii": return "warning";
      case "injection": return "danger";
      case "custom": return "info";
      default: return "muted";
    }
  };

  const actionColor = (action: string) => {
    switch (action) {
      case "block": return "danger";
      case "warn": return "warning";
      case "redact": return "info";
      default: return "muted";
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <PageHeader title="Input Safety" subtitle="Configure input validation and threat detection" actions={<><Button variant="primary" size="sm" onClick={() => saveMutation.mutate()} loading={saveMutation.isPending}>
          <Save className="w-3 h-3 mr-1" />Save Changes
        </Button></>} />

      {isLoading ? (
        <div className="space-y-4">{Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}</div>
      ) : (
        <>
          {/* Fail Mode */}
          <div className="instrument-card p-5">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <span className="text-sm font-display font-semibold text-foreground">Fail Mode</span>
            </div>
            <p className="text-xs text-muted-foreground mb-4">Action when an input safety check fails</p>
            <div className="flex gap-2">
              {(["block", "warn", "log"] as const).map(mode => (
                <button key={mode} onClick={() => setFailMode(mode)}
                  className={cn("px-4 py-2 text-xs font-medium rounded-md border transition-colors capitalize",
                    failMode === mode ? "bg-cordum/10 border-cordum/30 text-cordum" : "border-border text-muted-foreground hover:text-foreground")}>
                  {mode}
                </button>
              ))}
            </div>
          </div>

          {/* Rules */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Detection Rules ({rules.length})</p>
              <Button variant="outline" size="sm" onClick={() => toast.info("Feature coming soon")}>
                <Plus className="w-3 h-3 mr-1" />Add Rule
              </Button>
            </div>
            {rules.map((rule, i) => (
              <motion.div key={rule.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                className={cn("instrument-card p-4 flex items-center justify-between", !rule.enabled && "opacity-50")}>
                <div className="flex items-center gap-3">
                  <button onClick={() => toggleRule(rule.id)}
                    className={cn("w-9 h-5 rounded-full relative transition-colors shrink-0", rule.enabled ? "bg-cordum" : "bg-surface-2")}>
                    <div className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform", rule.enabled ? "left-[18px]" : "left-0.5")} />
                  </button>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">{rule.name}</span>
                      <StatusBadge variant={typeColor(rule.type) as any}>{rule.type}</StatusBadge>
                      <StatusBadge variant={actionColor(rule.action) as any}>{rule.action}</StatusBadge>
                    </div>
                    {rule.pattern && <p className="text-[10px] font-mono text-muted-foreground mt-0.5">{rule.pattern}</p>}
                  </div>
                </div>
                {rule.type === "custom" && (
                  <button onClick={() => removeRule(rule.id)} className="p-1.5 rounded hover:bg-red-500/10 transition-colors">
                    <Trash2 className="w-3.5 h-3.5 text-red-400" />
                  </button>
                )}
              </motion.div>
            ))}
          </div>
        </>
      )}
    </motion.div>
  );
}
