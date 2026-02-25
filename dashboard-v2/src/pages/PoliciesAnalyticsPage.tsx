/*
 * DESIGN: "Control Surface" — Policy Analytics
 * PRD Section 19: Deep analytics on policy performance
 */
import { useState } from "react";
import { motion } from "framer-motion";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";
import { cn } from "@/lib/utils";

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-surface-2 border border-border rounded-lg p-3 shadow-xl">
      <p className="font-mono text-xs text-muted-foreground mb-1">{label}</p>
      {payload.map((entry: any, i: number) => (
        <div key={i} className="flex items-center gap-2 text-xs">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-muted-foreground">{entry.name}:</span>
          <span className="font-mono text-foreground font-medium">{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

const evalData = Array.from({ length: 12 }, (_, i) => ({
  time: `${String(i * 2).padStart(2, "0")}:00`,
  allowed: Math.floor(Math.random() * 300 + 200),
  denied: Math.floor(Math.random() * 30 + 5),
  approval: Math.floor(Math.random() * 20 + 3),
}));

const latencyData = Array.from({ length: 12 }, (_, i) => ({
  time: `${String(i * 2).padStart(2, "0")}:00`,
  p50: Math.random() * 3 + 1,
  p95: Math.random() * 6 + 4,
  p99: Math.random() * 10 + 8,
}));

const topRules = [
  { name: "block-prod-writes", decision: "DENY", matches: 847, rate: "34.2%" },
  { name: "require-approval-deploy", decision: "REQUIRE_APPROVAL", matches: 312, rate: "12.6%" },
  { name: "allow-read-ops", decision: "ALLOW", matches: 1203, rate: "48.6%" },
  { name: "throttle-batch-jobs", decision: "THROTTLE", matches: 89, rate: "3.6%" },
  { name: "block-external-ips", decision: "DENY", matches: 24, rate: "1.0%" },
];

function decisionVariant(d: string) {
  if (d === "ALLOW") return "healthy" as const;
  if (d === "DENY") return "danger" as const;
  return "warning" as const;
}

export default function PolicyAnalyticsPage() {
  const [timeRange, setTimeRange] = useState("24h");

  return (
    <div className="space-y-6">
      <PageHeader
        label="Govern"
        title="Policy Analytics"
        subtitle="Deep analytics on policy performance and evaluation patterns"
        actions={
          <div className="flex items-center gap-1 bg-surface-1 border border-border rounded-md p-0.5">
            {["1h", "24h", "7d", "30d"].map(t => (
              <button key={t} onClick={() => setTimeRange(t)} className={cn("px-3 py-1 text-xs font-mono rounded transition-colors", timeRange === t ? "bg-cordum/10 text-cordum" : "text-muted-foreground hover:text-foreground")}>
                {t}
              </button>
            ))}
          </div>
        }
      />

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="instrument-card p-5">
          <h3 className="font-display font-semibold text-sm text-foreground mb-1">Evaluation Volume</h3>
          <p className="text-xs text-muted-foreground mb-4">Stacked by decision type</p>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={evalData}>
              <defs>
                <linearGradient id="gAllow" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10B981" stopOpacity={0.3} /><stop offset="95%" stopColor="#10B981" stopOpacity={0} /></linearGradient>
                <linearGradient id="gDeny" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#EF4444" stopOpacity={0.3} /><stop offset="95%" stopColor="#EF4444" stopOpacity={0} /></linearGradient>
                <linearGradient id="gApproval" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#F59E0B" stopOpacity={0.3} /><stop offset="95%" stopColor="#F59E0B" stopOpacity={0} /></linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="time" tick={{ fontSize: 10, fill: "#6B7A90" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#6B7A90" }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Area type="monotone" dataKey="allowed" stroke="#10B981" fill="url(#gAllow)" strokeWidth={2} name="Allowed" stackId="1" />
              <Area type="monotone" dataKey="denied" stroke="#EF4444" fill="url(#gDeny)" strokeWidth={2} name="Denied" stackId="1" />
              <Area type="monotone" dataKey="approval" stroke="#F59E0B" fill="url(#gApproval)" strokeWidth={2} name="Approval" stackId="1" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="instrument-card p-5">
          <h3 className="font-display font-semibold text-sm text-foreground mb-1">Evaluation Latency</h3>
          <p className="text-xs text-muted-foreground mb-4">P50 / P95 / P99 in milliseconds</p>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={latencyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="time" tick={{ fontSize: 10, fill: "#6B7A90" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#6B7A90" }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Line type="monotone" dataKey="p50" stroke="#10B981" strokeWidth={2} dot={false} name="P50" />
              <Line type="monotone" dataKey="p95" stroke="#F59E0B" strokeWidth={2} dot={false} name="P95" />
              <Line type="monotone" dataKey="p99" stroke="#EF4444" strokeWidth={2} dot={false} name="P99" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top Rules Table */}
      <div className="instrument-card overflow-hidden">
        <div className="px-5 py-3 border-b border-border">
          <h3 className="font-display font-semibold text-sm text-foreground">Top Triggered Rules</h3>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-surface-0">
              <th className="text-left px-5 py-3 text-xs font-mono font-medium text-muted-foreground uppercase tracking-wider">Rule</th>
              <th className="text-left px-5 py-3 text-xs font-mono font-medium text-muted-foreground uppercase tracking-wider">Decision</th>
              <th className="text-left px-5 py-3 text-xs font-mono font-medium text-muted-foreground uppercase tracking-wider">Matches (24h)</th>
              <th className="text-left px-5 py-3 text-xs font-mono font-medium text-muted-foreground uppercase tracking-wider">Match Rate</th>
            </tr>
          </thead>
          <tbody>
            {topRules.map((r) => (
              <tr key={r.name} className="border-b border-border hover:bg-surface-1 transition-colors">
                <td className="px-5 py-3 font-mono text-sm text-cordum">{r.name}</td>
                <td className="px-5 py-3"><StatusBadge variant={decisionVariant(r.decision)}>{r.decision}</StatusBadge></td>
                <td className="px-5 py-3 font-mono text-sm text-foreground">{r.matches.toLocaleString()}</td>
                <td className="px-5 py-3 font-mono text-sm text-muted-foreground">{r.rate}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
