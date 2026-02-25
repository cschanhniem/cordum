/*
 * DESIGN: "Control Surface" — Policy Simulator
 * PRD Section 18: Test policies against job data
 */
import { useState } from "react";
import { motion } from "framer-motion";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  FlaskConical, Play, AlertTriangle, CheckCircle2, XCircle, Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";

const MOCK_RESULTS = [
  { jobId: "job-001", action: "service.restart", current: "ALLOW", draft: "DENY", changed: true },
  { jobId: "job-002", action: "data.read", current: "ALLOW", draft: "ALLOW", changed: false },
  { jobId: "job-003", action: "service.deploy", current: "ALLOW", draft: "REQUIRE_APPROVAL", changed: true },
  { jobId: "job-004", action: "data.transform", current: "DENY", draft: "DENY", changed: false },
  { jobId: "job-005", action: "service.restart", current: "ALLOW", draft: "DENY", changed: true },
  { jobId: "job-006", action: "data.export", current: "ALLOW", draft: "ALLOW", changed: false },
];

function decisionVariant(d: string) {
  if (d === "ALLOW") return "healthy" as const;
  if (d === "DENY") return "danger" as const;
  return "warning" as const;
}

export default function PolicySimulatorPage() {
  const [hasRun, setHasRun] = useState(false);
  const [dataSource, setDataSource] = useState("historical");
  const [timeRange, setTimeRange] = useState("24h");
  const [sampleSize, setSampleSize] = useState(100);

  const changedCount = MOCK_RESULTS.filter(r => r.changed).length;
  const allowCount = MOCK_RESULTS.filter(r => r.draft === "ALLOW").length;
  const denyCount = MOCK_RESULTS.filter(r => r.draft === "DENY").length;
  const approvalCount = MOCK_RESULTS.filter(r => r.draft === "REQUIRE_APPROVAL").length;

  return (
    <div className="space-y-6">
      <PageHeader label="Govern" title="Policy Simulator" subtitle="Test your policies against real or synthetic job data" />

      {/* Input Panel */}
      <div className="instrument-card p-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider block mb-1.5">Data Source</label>
            <select value={dataSource} onChange={(e) => setDataSource(e.target.value)} className="h-8 w-full px-3 text-xs bg-surface-1 border border-border rounded-md text-foreground focus:outline-none focus:ring-1 focus:ring-cordum">
              <option value="historical">Historical</option>
              <option value="custom">Custom JSON</option>
              <option value="single">Single Job</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider block mb-1.5">Time Range</label>
            <select value={timeRange} onChange={(e) => setTimeRange(e.target.value)} className="h-8 w-full px-3 text-xs bg-surface-1 border border-border rounded-md text-foreground focus:outline-none focus:ring-1 focus:ring-cordum">
              <option value="1h">Last 1 hour</option>
              <option value="24h">Last 24 hours</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider block mb-1.5">Sample Size</label>
            <input type="number" value={sampleSize} onChange={(e) => setSampleSize(Number(e.target.value))} className="h-8 w-full px-3 text-xs bg-surface-1 border border-border rounded-md text-foreground focus:outline-none focus:ring-1 focus:ring-cordum" />
          </div>
          <div className="flex items-end">
            <Button variant="primary" size="sm" className="w-full" onClick={() => setHasRun(true)}>
              <Play className="w-3 h-3 mr-1" />Run Simulation
            </Button>
          </div>
        </div>
      </div>

      {/* Results */}
      {hasRun && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="instrument-card p-5">
              <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Allowed</span>
              <p className="font-mono text-2xl font-bold text-emerald-400 mt-2">{allowCount}</p>
            </div>
            <div className="instrument-card p-5">
              <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Denied</span>
              <p className="font-mono text-2xl font-bold text-red-400 mt-2">{denyCount}</p>
            </div>
            <div className="instrument-card p-5">
              <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Approval Req.</span>
              <p className="font-mono text-2xl font-bold text-amber-400 mt-2">{approvalCount}</p>
            </div>
            <div className={cn("instrument-card p-5", changedCount > 0 && "status-warning")}>
              <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Changed</span>
              <p className={cn("font-mono text-2xl font-bold mt-2", changedCount > 0 ? "text-amber-400" : "text-foreground")}>{changedCount}</p>
            </div>
          </div>

          {/* Comparison Table */}
          <div className="instrument-card overflow-hidden">
            <div className="px-5 py-3 border-b border-border">
              <h3 className="font-display font-semibold text-sm text-foreground">Comparison: Current vs Draft</h3>
            </div>
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-surface-0">
                  <th className="text-left px-5 py-3 text-xs font-mono font-medium text-muted-foreground uppercase tracking-wider">Job ID</th>
                  <th className="text-left px-5 py-3 text-xs font-mono font-medium text-muted-foreground uppercase tracking-wider">Action</th>
                  <th className="text-left px-5 py-3 text-xs font-mono font-medium text-muted-foreground uppercase tracking-wider">Current</th>
                  <th className="text-left px-5 py-3 text-xs font-mono font-medium text-muted-foreground uppercase tracking-wider">Draft</th>
                  <th className="text-left px-5 py-3 text-xs font-mono font-medium text-muted-foreground uppercase tracking-wider">Changed?</th>
                </tr>
              </thead>
              <tbody>
                {MOCK_RESULTS.map((r) => (
                  <tr key={r.jobId} className={cn("border-b border-border transition-colors", r.changed ? "bg-amber-500/5" : "hover:bg-surface-1")}>
                    <td className="px-5 py-3 font-mono text-sm text-cordum">{r.jobId}</td>
                    <td className="px-5 py-3 text-sm text-foreground font-mono">{r.action}</td>
                    <td className="px-5 py-3"><StatusBadge variant={decisionVariant(r.current)}>{r.current}</StatusBadge></td>
                    <td className="px-5 py-3"><StatusBadge variant={decisionVariant(r.draft)}>{r.draft}</StatusBadge></td>
                    <td className="px-5 py-3">
                      {r.changed ? (
                        <span className="flex items-center gap-1 text-xs text-amber-400 font-mono"><AlertTriangle className="w-3 h-3" />CHANGED</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">No</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Impact Analysis */}
          <div className="instrument-card p-5">
            <h3 className="font-display font-semibold text-sm text-foreground mb-2">Impact Analysis</h3>
            <p className="text-sm text-muted-foreground">
              Deploying the draft policy would change the decision for <span className="text-amber-400 font-mono font-semibold">{changedCount}</span> out of <span className="font-mono">{MOCK_RESULTS.length}</span> jobs ({Math.round(changedCount / MOCK_RESULTS.length * 100)}%).
              <span className="text-red-400 font-mono"> {MOCK_RESULTS.filter(r => r.changed && r.draft === "DENY").length}</span> jobs would be newly denied.
              <span className="text-amber-400 font-mono"> {MOCK_RESULTS.filter(r => r.changed && r.draft === "REQUIRE_APPROVAL").length}</span> jobs would require approval.
            </p>
          </div>
        </motion.div>
      )}
    </div>
  );
}
