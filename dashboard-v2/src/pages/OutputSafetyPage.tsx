/*
 * DESIGN: "Control Surface" — Output Safety
 * PRD Section 34: Output safety monitoring
 */
import { useState } from "react";
import { motion } from "framer-motion";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  ShieldCheck, Search, AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";

const EVENTS = [
  { id: "os-1", jobId: "job-abc123", decision: "ALLOW", findings: 0, severity: "none", time: "2m ago" },
  { id: "os-2", jobId: "job-def456", decision: "QUARANTINE", findings: 3, severity: "critical", time: "5m ago" },
  { id: "os-3", jobId: "job-ghi789", decision: "ALLOW", findings: 1, severity: "low", time: "12m ago" },
  { id: "os-4", jobId: "job-jkl012", decision: "ALLOW", findings: 0, severity: "none", time: "15m ago" },
  { id: "os-5", jobId: "job-mno345", decision: "QUARANTINE", findings: 2, severity: "high", time: "20m ago" },
];

export default function OutputSafetyPage() {
  const [search, setSearch] = useState("");

  return (
    <div className="space-y-6">
      <PageHeader label="Safety" title="Output Safety" subtitle="Monitor output safety evaluations and quarantine events" />

      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <input type="text" placeholder="Search by job ID..." value={search} onChange={(e) => setSearch(e.target.value)} className="h-8 w-full pl-8 pr-3 text-xs bg-surface-1 border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-cordum" />
      </div>

      <div className="instrument-card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-surface-0">
              <th className="text-left px-5 py-3 text-xs font-mono font-medium text-muted-foreground uppercase tracking-wider">Job</th>
              <th className="text-left px-5 py-3 text-xs font-mono font-medium text-muted-foreground uppercase tracking-wider">Decision</th>
              <th className="text-left px-5 py-3 text-xs font-mono font-medium text-muted-foreground uppercase tracking-wider">Findings</th>
              <th className="text-left px-5 py-3 text-xs font-mono font-medium text-muted-foreground uppercase tracking-wider">Severity</th>
              <th className="text-left px-5 py-3 text-xs font-mono font-medium text-muted-foreground uppercase tracking-wider">Time</th>
            </tr>
          </thead>
          <tbody>
            {EVENTS.map(e => (
              <tr key={e.id} className={cn("border-b border-border transition-colors", e.decision === "QUARANTINE" ? "bg-red-500/5" : "hover:bg-surface-1")}>
                <td className="px-5 py-3 font-mono text-sm text-cordum">{e.jobId}</td>
                <td className="px-5 py-3">
                  <StatusBadge variant={e.decision === "ALLOW" ? "healthy" : "danger"}>{e.decision}</StatusBadge>
                </td>
                <td className="px-5 py-3 font-mono text-sm text-foreground">{e.findings}</td>
                <td className="px-5 py-3">
                  {e.severity === "none" ? (
                    <span className="text-xs text-muted-foreground">—</span>
                  ) : (
                    <StatusBadge variant={e.severity === "critical" ? "danger" : e.severity === "high" ? "warning" : "info"}>
                      {e.severity}
                    </StatusBadge>
                  )}
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
