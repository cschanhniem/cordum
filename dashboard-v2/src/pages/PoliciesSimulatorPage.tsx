/*
 * DESIGN: "Control Surface" — Policy Simulator
 * PRD Section 18: Test payloads against policy rules
 */
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { post } from "@/api/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Play, RotateCcw, CheckCircle2, XCircle, AlertTriangle, Code, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface SimResult {
  decision: "allow" | "deny" | "warn";
  rules: { name: string; result: "pass" | "fail" | "warn"; reason?: string }[];
  latency: string;
}

const SAMPLE_PAYLOADS = [
  { label: "Normal Request", value: JSON.stringify({ topic: "service.restart", payload: { service: "api", reason: "deploy" } }, null, 2) },
  { label: "High Risk", value: JSON.stringify({ topic: "db.drop-table", payload: { table: "users", confirm: true } }, null, 2) },
  { label: "PII Content", value: JSON.stringify({ topic: "email.send", payload: { to: "john@example.com", body: "SSN: 123-45-6789" } }, null, 2) },
];

export default function PoliciesSimulatorPage() {
  const [payload, setPayload] = useState(SAMPLE_PAYLOADS[0].value);
  const [result, setResult] = useState<SimResult | null>(null);

  const simulateMutation = useMutation({
    mutationFn: async () => {
      const res: any = await post("/api/policies/simulate", JSON.parse(payload));
      return res.data as SimResult;
    },
    onSuccess: (data) => setResult(data),
    onError: () => toast.error("Invalid payload"),
  });

  const decisionIcon = (d: string) => {
    switch (d) {
      case "allow": return <CheckCircle2 className="w-5 h-5 text-emerald-400" />;
      case "deny": return <XCircle className="w-5 h-5 text-red-400" />;
      case "warn": return <AlertTriangle className="w-5 h-5 text-amber-400" />;
      default: return null;
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <PageHeader title="Policy Simulator" subtitle="Test payloads against active policy rules" />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Input Panel */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Test Payload</p>
            <div className="flex gap-1">
              {SAMPLE_PAYLOADS.map(sp => (
                <button key={sp.label} onClick={() => { setPayload(sp.value); setResult(null); }}
                  className="px-2 py-1 text-[10px] font-mono rounded bg-surface-1 text-muted-foreground hover:text-foreground transition-colors">
                  {sp.label}
                </button>
              ))}
            </div>
          </div>
          <div className="instrument-card p-0 overflow-hidden">
            <textarea
              value={payload}
              onChange={(e) => setPayload(e.target.value)}
              className="w-full h-64 p-4 text-xs font-mono bg-transparent text-foreground resize-none focus:outline-none"
              spellCheck={false}
            />
          </div>
          <div className="flex gap-2">
            <Button variant="primary" size="sm" onClick={() => simulateMutation.mutate()} loading={simulateMutation.isPending}>
              <Play className="w-3 h-3 mr-1" />Simulate
            </Button>
            <Button variant="ghost" size="sm" onClick={() => { setPayload(SAMPLE_PAYLOADS[0].value); setResult(null); }}>
              <RotateCcw className="w-3 h-3 mr-1" />Reset
            </Button>
          </div>
        </div>

        {/* Result Panel */}
        <div className="space-y-4">
          <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Result</p>
          <AnimatePresence mode="wait">
            {result ? (
              <motion.div key="result" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
                <div className={cn("instrument-card p-5",
                  result.decision === "allow" ? "status-healthy" : result.decision === "deny" ? "status-danger" : "status-warning")}>
                  <div className="flex items-center gap-3">
                    {decisionIcon(result.decision)}
                    <div>
                      <span className="text-lg font-display font-bold text-foreground capitalize">{result.decision}</span>
                      <p className="text-xs text-muted-foreground font-mono">Evaluated in {result.latency}</p>
                    </div>
                  </div>
                </div>
                <div className="instrument-card overflow-hidden">
                  <div className="px-4 py-3 bg-surface-0 border-b border-border">
                    <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Rule Results</p>
                  </div>
                  <div className="divide-y divide-border">
                    {result.rules.map(rule => (
                      <div key={rule.name} className="flex items-center justify-between px-4 py-3">
                        <div>
                          <span className="text-xs font-mono text-foreground">{rule.name}</span>
                          {rule.reason && <p className="text-[10px] text-muted-foreground">{rule.reason}</p>}
                        </div>
                        <StatusBadge variant={rule.result === "pass" ? "healthy" : rule.result === "fail" ? "danger" : "warning"}>{rule.result}</StatusBadge>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="instrument-card p-12 text-center">
                <Code className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">Click "Simulate" to test your payload</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}
