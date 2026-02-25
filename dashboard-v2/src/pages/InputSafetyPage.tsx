/*
 * DESIGN: "Control Surface" — Input Safety
 * PRD Section 33: Input safety monitoring
 */
import { useState } from "react";
import { motion } from "framer-motion";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  Shield, Search,
} from "lucide-react";
import { cn } from "@/lib/utils";

const EVENTS = [
  { id: "is-1", jobId: "job-abc123", action: "service.restart", decision: "ALLOW", rule: "allow-read-ops", riskScore: 0.12, time: "2m ago" },
  { id: "is-2", jobId: "job-def456", action: "data.delete", decision: "DENY", rule: "block-prod-writes", riskScore: 0.95, time: "5m ago" },
  { id: "is-3", jobId: "job-ghi789", action: "service.deploy", decision: "REQUIRE_APPROVAL", rule: "require-approval-deploy", riskScore: 0.67, time: "12m ago" },
  { id: "is-4", jobId: "job-jkl012", action: "data.read", decision: "ALLOW", rule: "allow-read-ops", riskScore: 0.05, time: "15m ago" },
  { id: "is-5", jobId: "job-mno345", action: "service.restart", decision: "DENY", rule: "block-prod-writes", riskScore: 0.88, time: "20m ago" },
];

function decisionVariant(d: string) {
  if (d === "ALLOW") return "healthy" as const;
  if (d === "DENY") return "danger" as const;
  return "warning" as const;
}

export default function InputSafetyPage() {
  const [search, setSearch] = useState("");

  return (
    <div className="space-y-6">
      <PageHeader label="Safety" title="Input Safety" subtitle="Monitor input safety evaluations in real-time" />

      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <input type="text" placeholder="Search by job ID or action..." value={search} onChange={(e) => setSearch(e.target.value)} className="h-8 w-full pl-8 pr-3 text-xs bg-surface-1 border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-cordum" />
      </div>

      <div className="instrument-card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-surface-0">
              <th className="text-left px-5 py-3 text-xs font-mono font-medium text-muted-foreground uppercase tracking-wider">Job</th>
              <th className="text-left px-5 py-3 text-xs font-mono font-medium text-muted-foreground uppercase tracking-wider">Action</th>
              <th className="text-left px-5 py-3 text-xs font-mono font-medium text-muted-foreground uppercase tracking-wider">Decision</th>
              <th className="text-left px-5 py-3 text-xs font-mono font-medium text-muted-foreground uppercase tracking-wider">Rule</th>
              <th className="text-left px-5 py-3 text-xs font-mono font-medium text-muted-foreground uppercase tracking-wider">Risk</th>
              <th className="text-left px-5 py-3 text-xs font-mono font-medium text-muted-foreground uppercase tracking-wider">Time</th>
            </tr>
          </thead>
          <tbody>
            {EVENTS.map(e => (
              <tr key={e.id} className={cn("border-b border-border transition-colors", e.decision === "DENY" ? "bg-red-500/5" : "hover:bg-surface-1")}>
                <td className="px-5 py-3 font-mono text-sm text-cordum">{e.jobId}</td>
                <td className="px-5 py-3 font-mono text-sm text-foreground">{e.action}</td>
                <td className="px-5 py-3"><StatusBadge variant={decisionVariant(e.decision)}>{e.decision}</StatusBadge></td>
                <td className="px-5 py-3 font-mono text-xs text-muted-foreground">{e.rule}</td>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-12 h-1.5 rounded-full bg-surface-2 overflow-hidden">
                      <div className={cn("h-full rounded-full", e.riskScore > 0.7 ? "bg-red-400" : e.riskScore > 0.4 ? "bg-amber-400" : "bg-emerald-400")} style={{ width: `${e.riskScore * 100}%` }} />
                    </div>
                    <span className="font-mono text-xs text-muted-foreground">{e.riskScore.toFixed(2)}</span>
                  </div>
                </td>
                <td className="px-5 py-3 text-sm text-muted-foreground">{e.time}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
