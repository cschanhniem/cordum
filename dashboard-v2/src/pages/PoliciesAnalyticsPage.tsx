/*
 * DESIGN: "Control Surface" — Policy Analytics
 * PRD Section 19: Evaluation charts and decision breakdown
 */
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { get } from "@/api/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { SkeletonCard } from "@/components/ui/Skeleton";
import { BarChart3, TrendingUp, Shield, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

const CHART_COLORS = ["#00E5A0", "#3B82F6", "#F59E0B", "#EF4444"];

const MOCK_TREND = [
  { date: "Mon", allowed: 142, blocked: 8, warned: 12 },
  { date: "Tue", allowed: 156, blocked: 5, warned: 9 },
  { date: "Wed", allowed: 138, blocked: 12, warned: 15 },
  { date: "Thu", allowed: 167, blocked: 3, warned: 7 },
  { date: "Fri", allowed: 189, blocked: 6, warned: 11 },
  { date: "Sat", allowed: 78, blocked: 2, warned: 4 },
  { date: "Sun", allowed: 45, blocked: 1, warned: 2 },
];

const MOCK_BREAKDOWN = [
  { name: "Allowed", value: 915, color: "#00E5A0" },
  { name: "Warned", value: 60, color: "#F59E0B" },
  { name: "Blocked", value: 37, color: "#EF4444" },
];

export default function PoliciesAnalyticsPage() {
  const { isLoading } = useQuery({
    queryKey: ["policy-analytics"],
    queryFn: async () => {
      const res: any = await get("/api/policies/analytics");
      return res.data;
    },
  });

  const total = MOCK_BREAKDOWN.reduce((s, b) => s + b.value, 0);

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <PageHeader title="Policy Analytics" subtitle="Evaluation trends and decision breakdown" />

      {isLoading ? (
        <div className="grid grid-cols-3 gap-4">{Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}</div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { label: "Total Evaluations", value: total.toLocaleString(), icon: Shield, change: "+12%", up: true },
              { label: "Block Rate", value: `${((37 / total) * 100).toFixed(1)}%`, icon: XCircle, change: "-0.3%", up: false },
              { label: "Avg Latency", value: "2.4ms", icon: TrendingUp, change: "-8%", up: false },
            ].map((kpi, i) => {
              const Icon = kpi.icon;
              return (
                <motion.div key={kpi.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                  className="instrument-card p-5">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">{kpi.label}</span>
                    <Icon className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div className="flex items-end gap-2">
                    <span className="text-2xl font-mono font-bold text-foreground">{kpi.value}</span>
                    <span className={cn("text-xs font-mono mb-1", kpi.up ? "text-emerald-400" : "text-red-400")}>{kpi.change}</span>
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* Trend Chart */}
          <div className="instrument-card p-5">
            <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-4">Evaluation Trend (7 days)</p>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={MOCK_TREND}>
                  <XAxis dataKey="date" tick={{ fill: "#6B7280", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#6B7280", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: "#1E293B", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", fontSize: "12px" }} />
                  <Area type="monotone" dataKey="allowed" stackId="1" stroke="#00E5A0" fill="#00E5A0" fillOpacity={0.2} />
                  <Area type="monotone" dataKey="warned" stackId="1" stroke="#F59E0B" fill="#F59E0B" fillOpacity={0.2} />
                  <Area type="monotone" dataKey="blocked" stackId="1" stroke="#EF4444" fill="#EF4444" fillOpacity={0.2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Decision Breakdown */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="instrument-card p-5">
              <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-4">Decision Breakdown</p>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={MOCK_BREAKDOWN} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                      {MOCK_BREAKDOWN.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: "#1E293B", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", fontSize: "12px" }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex justify-center gap-4 mt-2">
                {MOCK_BREAKDOWN.map(b => (
                  <div key={b.name} className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full" style={{ background: b.color }} />
                    <span className="text-[10px] text-muted-foreground">{b.name} ({b.value})</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="instrument-card p-5">
              <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-4">Top Blocked Rules</p>
              <div className="space-y-3">
                {[
                  { rule: "max-token-limit", count: 15, pct: 40 },
                  { rule: "pii-detection", count: 12, pct: 32 },
                  { rule: "rate-limit-exceeded", count: 7, pct: 19 },
                  { rule: "forbidden-topic", count: 3, pct: 8 },
                ].map((r, i) => (
                  <div key={r.rule}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-mono text-foreground">{r.rule}</span>
                      <span className="text-xs text-muted-foreground">{r.count} blocks</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
                      <motion.div className="h-full rounded-full bg-red-400" initial={{ width: 0 }} animate={{ width: `${r.pct}%` }}
                        transition={{ duration: 0.6, delay: i * 0.1 }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </motion.div>
  );
}
