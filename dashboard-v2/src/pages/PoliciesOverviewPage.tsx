import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { get } from "@/api/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { InstrumentCard, InstrumentCardHeader, InstrumentCardBody } from "@/components/ui/InstrumentCard";
import { MetricValue } from "@/components/ui/MetricValue";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { SkeletonCard } from "@/components/ui/Skeleton";
import { AreaChart, Area, ResponsiveContainer, CartesianGrid, XAxis, YAxis, Tooltip } from "recharts";
import { Shield, Plus, ArrowRight, FileText, Activity, History, FlaskConical } from "lucide-react";

export default function PoliciesOverviewPage() {
  const navigate = useNavigate();

  const { data: rules, isLoading } = useQuery({
    queryKey: ["policy-rules"],
    queryFn: async () => {
      const res = await get<{ items: any[] }>("/policies/rules?limit=500");
      return res.items ?? [];
    },
  });

  const allRules = rules ?? [];
  const activeRules = allRules.filter((r) => r.enabled !== false);

  // Mock evaluation data
  const evalData = Array.from({ length: 24 }, (_, i) => ({
    hour: `${i}:00`,
    allow: Math.floor(Math.random() * 80 + 20),
    deny: Math.floor(Math.random() * 10),
    escalate: Math.floor(Math.random() * 8),
  }));

  const quickLinks = [
    { label: "Policy Rules", desc: "Manage allow/deny/escalate rules", icon: Shield, path: "/policies/rules" },
    { label: "Rule Builder", desc: "Create new policy rules", icon: Plus, path: "/policies/rules/new" },
    { label: "Simulator", desc: "Test policies against payloads", icon: FlaskConical, path: "/policies/simulator" },
    { label: "History", desc: "View policy change log", icon: History, path: "/policies/history" },
    { label: "Analytics", desc: "Decision metrics & trends", icon: Activity, path: "/policies/analytics" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Policy Studio"
        subtitle="Manage safety policies for agent actions"
        actions={
          <Button variant="primary" size="sm" onClick={() => navigate("/policies/rules/new")}>
            <Plus className="w-3.5 h-3.5" />
            New Rule
          </Button>
        }
      />

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            <InstrumentCard accent="cordum">
              <InstrumentCardBody className="pt-4">
                <MetricValue label="Total Rules" value={allRules.length} />
              </InstrumentCardBody>
            </InstrumentCard>
            <InstrumentCard accent="healthy">
              <InstrumentCardBody className="pt-4">
                <MetricValue label="Active" value={activeRules.length} />
              </InstrumentCardBody>
            </InstrumentCard>
            <InstrumentCard accent="info">
              <InstrumentCardBody className="pt-4">
                <MetricValue label="Evaluations (24h)" value="2.4k" trend={{ value: 15, label: "vs yesterday" }} />
              </InstrumentCardBody>
            </InstrumentCard>
            <InstrumentCard accent={false ? "danger" : "healthy"}>
              <InstrumentCardBody className="pt-4">
                <MetricValue label="Deny Rate" value="3.2%" trend={{ value: -0.5, label: "vs yesterday" }} />
              </InstrumentCardBody>
            </InstrumentCard>
          </>
        )}
      </div>

      {/* Evaluation Chart */}
      <InstrumentCard>
        <InstrumentCardHeader title="Policy Evaluations" subtitle="Last 24 hours" icon={<Activity className="w-4 h-4" />} />
        <InstrumentCardBody>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={evalData}>
                <defs>
                  <linearGradient id="allowGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#27b3a8" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#27b3a8" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="denyGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#e05555" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#e05555" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(229,239,236,0.06)" strokeDasharray="3 3" />
                <XAxis dataKey="hour" tick={{ fontSize: 10, fill: "#7a8f8c" }} axisLine={false} tickLine={false} interval={3} />
                <YAxis tick={{ fontSize: 10, fill: "#7a8f8c" }} axisLine={false} tickLine={false} width={30} />
                <Tooltip
                  contentStyle={{ background: "var(--surface)", border: "1px solid var(--border-color)", borderRadius: "6px" }}
                  labelStyle={{ color: "var(--text-muted)", fontSize: 11 }}
                />
                <Area type="monotone" dataKey="allow" stroke="#27b3a8" strokeWidth={2} fill="url(#allowGrad)" name="Allow" />
                <Area type="monotone" dataKey="deny" stroke="#e05555" strokeWidth={2} fill="url(#denyGrad)" name="Deny" />
                <Area type="monotone" dataKey="escalate" stroke="#d4a03a" strokeWidth={1.5} fill="none" name="Escalate" strokeDasharray="4 2" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </InstrumentCardBody>
      </InstrumentCard>

      {/* Quick Links */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {quickLinks.map((link) => (
          <InstrumentCard key={link.path} hoverable onClick={() => navigate(link.path)}>
            <InstrumentCardBody className="py-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-cordum/10 flex items-center justify-center text-cordum shrink-0">
                <link.icon className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">{link.label}</p>
                <p className="text-xs text-muted-foreground">{link.desc}</p>
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
            </InstrumentCardBody>
          </InstrumentCard>
        ))}
      </div>
    </div>
  );
}
