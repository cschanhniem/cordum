/*
 * DESIGN: "Control Surface" — MCP Server
 * MCP server management with tool discovery, analytics, and policy integration
 */
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { get } from "@/api/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonCard } from "@/components/ui/Skeleton";
import {
  Server, Plug, RefreshCw, Copy, ChevronDown, ChevronRight,
  Wrench, Plus, Shield, BarChart3, Activity, AlertTriangle,
  Globe, Lock, Zap, Clock, Eye,
} from "lucide-react";
import { cn, formatRelativeTime } from "@/lib/utils";
import { toast } from "sonner";
import {
  BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";

interface McpServer {
  id: string;
  name: string;
  url: string;
  status: "connected" | "disconnected" | "error";
  tools: { name: string; description: string; call_count_24h?: number; avg_latency_ms?: number; policy_decision?: string }[];
  resources?: { uri: string; name: string; description: string; access_count_24h?: number }[];
  lastPing: string;
  total_calls_24h?: number;
  denied_calls_24h?: number;
  avg_latency_ms?: number;
  policy_bindings?: string[];
}

/* Mock data for MCP analytics */
const mockServers: McpServer[] = [
  {
    id: "mcp-github",
    name: "GitHub MCP",
    url: "https://mcp.github.com/v1",
    status: "connected",
    tools: [
      { name: "create_pull_request", description: "Create a new pull request", call_count_24h: 145, avg_latency_ms: 320, policy_decision: "allow_with_constraints" },
      { name: "search_code", description: "Search code across repositories", call_count_24h: 892, avg_latency_ms: 180, policy_decision: "allow" },
      { name: "create_issue", description: "Create a new issue", call_count_24h: 67, avg_latency_ms: 250, policy_decision: "allow" },
      { name: "delete_branch", description: "Delete a branch", call_count_24h: 12, avg_latency_ms: 150, policy_decision: "require_approval" },
    ],
    resources: [
      { uri: "github://repos", name: "Repositories", description: "List accessible repositories", access_count_24h: 340 },
      { uri: "github://issues", name: "Issues", description: "List issues across repos", access_count_24h: 128 },
    ],
    lastPing: new Date(Date.now() - 5000).toISOString(),
    total_calls_24h: 1116,
    denied_calls_24h: 3,
    avg_latency_ms: 225,
    policy_bindings: ["mcp/tool-restrictions", "default/global"],
  },
  {
    id: "mcp-slack",
    name: "Slack MCP",
    url: "https://mcp.slack.com/v1",
    status: "connected",
    tools: [
      { name: "send_message", description: "Send a message to a channel", call_count_24h: 234, avg_latency_ms: 95, policy_decision: "allow_with_constraints" },
      { name: "create_channel", description: "Create a new channel", call_count_24h: 5, avg_latency_ms: 180, policy_decision: "deny" },
    ],
    lastPing: new Date(Date.now() - 12000).toISOString(),
    total_calls_24h: 239,
    denied_calls_24h: 5,
    avg_latency_ms: 100,
    policy_bindings: ["default/global"],
  },
  {
    id: "mcp-filesystem",
    name: "Filesystem MCP",
    url: "stdio://mcp-filesystem",
    status: "connected",
    tools: [
      { name: "read_file", description: "Read file contents", call_count_24h: 1450, avg_latency_ms: 12, policy_decision: "allow" },
      { name: "write_file", description: "Write to a file", call_count_24h: 320, avg_latency_ms: 18, policy_decision: "allow_with_constraints" },
      { name: "delete_file", description: "Delete a file", call_count_24h: 8, avg_latency_ms: 10, policy_decision: "require_approval" },
    ],
    lastPing: new Date(Date.now() - 2000).toISOString(),
    total_calls_24h: 1778,
    denied_calls_24h: 0,
    avg_latency_ms: 14,
    policy_bindings: ["mcp/tool-restrictions"],
  },
];

const hourlyMcpCalls = Array.from({ length: 24 }, (_, i) => ({
  hour: `${String(i).padStart(2, "0")}:00`,
  calls: Math.floor(Math.random() * 200 + 50),
  denied: Math.floor(Math.random() * 5),
}));

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-surface-2 border border-border rounded-lg p-2 shadow-xl">
      <p className="font-mono text-[10px] text-muted-foreground mb-1">{label}</p>
      {payload.map((entry: any, i: number) => (
        <div key={i} className="flex items-center gap-2 text-[10px]">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-muted-foreground">{entry.name}:</span>
          <span className="font-mono text-foreground">{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

function PolicyBadge({ decision }: { decision?: string }) {
  const config: Record<string, { color: string; bg: string }> = {
    allow: { color: "text-emerald-400", bg: "bg-emerald-400/10" },
    deny: { color: "text-red-400", bg: "bg-red-400/10" },
    require_approval: { color: "text-amber-400", bg: "bg-amber-400/10" },
    allow_with_constraints: { color: "text-blue-400", bg: "bg-blue-400/10" },
  };
  const c = config[decision ?? ""] ?? { color: "text-muted-foreground", bg: "bg-surface-2" };
  return (
    <span className={cn("px-1.5 py-0.5 rounded font-mono text-[10px] font-semibold", c.color, c.bg)}>
      {(decision ?? "—").toUpperCase().replace(/_/g, " ")}
    </span>
  );
}

export default function SettingsMcpPage() {
  const [expandedServer, setExpandedServer] = useState<string | null>(null);
  const [tab, setTab] = useState<"servers" | "analytics">("servers");

  // In production: useQuery for GET /api/v1/mcp/servers
  const servers = mockServers;
  const isLoading = false;

  const totalCalls = servers.reduce((s, srv) => s + (srv.total_calls_24h ?? 0), 0);
  const totalDenied = servers.reduce((s, srv) => s + (srv.denied_calls_24h ?? 0), 0);
  const totalTools = servers.reduce((s, srv) => s + srv.tools.length, 0);

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <PageHeader
        title="MCP Servers"
        subtitle={`${servers.length} servers · ${totalTools} tools · ${totalCalls.toLocaleString()} calls/24h`}
        actions={
          <Button variant="primary" size="sm" onClick={() => toast.info("Feature coming soon")}>
            <Plus className="w-3 h-3 mr-1" />
            Add Server
          </Button>
        }
      />

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="instrument-card p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">Servers</span>
            <Server className="w-4 h-4 text-cordum" />
          </div>
          <span className="font-mono text-2xl font-bold text-foreground">{servers.length}</span>
          <p className="text-xs text-muted-foreground mt-1">{servers.filter(s => s.status === "connected").length} connected</p>
        </div>
        <div className="instrument-card p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">Tools</span>
            <Wrench className="w-4 h-4 text-cordum" />
          </div>
          <span className="font-mono text-2xl font-bold text-foreground">{totalTools}</span>
          <p className="text-xs text-muted-foreground mt-1">across all servers</p>
        </div>
        <div className="instrument-card p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">Calls (24h)</span>
            <Zap className="w-4 h-4 text-cordum" />
          </div>
          <span className="font-mono text-2xl font-bold text-foreground">{totalCalls.toLocaleString()}</span>
        </div>
        <div className={cn("instrument-card p-4", totalDenied > 0 && "status-warning")}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">Denied (24h)</span>
            <Shield className="w-4 h-4 text-amber-400" />
          </div>
          <span className={cn("font-mono text-2xl font-bold", totalDenied > 0 ? "text-amber-400" : "text-foreground")}>{totalDenied}</span>
          <p className="text-xs text-muted-foreground mt-1">by policy rules</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-4 border-b border-border">
        <button
          onClick={() => setTab("servers")}
          className={cn(
            "pb-2 text-sm font-medium border-b-2 transition-colors",
            tab === "servers" ? "border-cordum text-cordum" : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          <Plug className="w-3.5 h-3.5 inline mr-1.5" />
          Servers ({servers.length})
        </button>
        <button
          onClick={() => setTab("analytics")}
          className={cn(
            "pb-2 text-sm font-medium border-b-2 transition-colors",
            tab === "analytics" ? "border-cordum text-cordum" : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          <BarChart3 className="w-3.5 h-3.5 inline mr-1.5" />
          Analytics
        </button>
      </div>

      {tab === "servers" && (
        <div className="space-y-3">
          {servers.map((server, i) => {
            const isExpanded = expandedServer === server.id;
            return (
              <motion.div
                key={server.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className={cn("instrument-card overflow-hidden", server.status === "connected" && "status-healthy")}
              >
                <div
                  className="p-5 cursor-pointer hover:bg-surface-1 transition-colors"
                  onClick={() => setExpandedServer(isExpanded ? null : server.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                      <Plug className="w-4 h-4 text-cordum" />
                      <div>
                        <span className="text-sm font-display font-semibold text-foreground">{server.name}</span>
                        <p className="text-xs font-mono text-muted-foreground mt-0.5">{server.url}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right text-xs">
                        <p className="font-mono text-foreground">{(server.total_calls_24h ?? 0).toLocaleString()} calls</p>
                        <p className="text-muted-foreground">{server.avg_latency_ms}ms avg</p>
                      </div>
                      <StatusBadge variant={server.status === "connected" ? "healthy" : server.status === "error" ? "danger" : "muted"} dot>
                        {server.status}
                      </StatusBadge>
                    </div>
                  </div>
                </div>

                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="border-t border-border"
                    >
                      <div className="p-5 space-y-4">
                        {/* Policy bindings */}
                        {server.policy_bindings && server.policy_bindings.length > 0 && (
                          <div>
                            <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-2">Policy Bindings</p>
                            <div className="flex flex-wrap gap-1.5">
                              {server.policy_bindings.map((b) => (
                                <span key={b} className="px-2 py-0.5 rounded bg-cordum/10 text-[10px] font-mono text-cordum">{b}</span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Tools */}
                        <div>
                          <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-2">Tools ({server.tools.length})</p>
                          <div className="space-y-1.5">
                            {server.tools.map((tool) => (
                              <div key={tool.name} className="flex items-center gap-3 px-3 py-2 rounded-md bg-surface-1">
                                <Wrench className="w-3 h-3 text-cordum shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <span className="text-xs font-mono font-medium text-foreground">{tool.name}</span>
                                  <p className="text-[10px] text-muted-foreground">{tool.description}</p>
                                </div>
                                <div className="flex items-center gap-3 shrink-0">
                                  <span className="text-[10px] font-mono text-muted-foreground">{(tool.call_count_24h ?? 0).toLocaleString()} calls</span>
                                  <span className="text-[10px] font-mono text-muted-foreground">{tool.avg_latency_ms}ms</span>
                                  <PolicyBadge decision={tool.policy_decision} />
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Resources */}
                        {server.resources && server.resources.length > 0 && (
                          <div>
                            <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-2">Resources ({server.resources.length})</p>
                            <div className="space-y-1.5">
                              {server.resources.map((res) => (
                                <div key={res.uri} className="flex items-center gap-3 px-3 py-2 rounded-md bg-surface-1">
                                  <Globe className="w-3 h-3 text-blue-400 shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <span className="text-xs font-mono font-medium text-foreground">{res.name}</span>
                                    <p className="text-[10px] text-muted-foreground">{res.uri}</p>
                                  </div>
                                  <span className="text-[10px] font-mono text-muted-foreground">{(res.access_count_24h ?? 0).toLocaleString()} reads</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Actions */}
                        <div className="flex gap-2 pt-2 border-t border-border">
                          <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); toast.info("Refreshing tools..."); }}>
                            <RefreshCw className="w-3 h-3 mr-1" />Refresh
                          </Button>
                          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(server.url); toast.success("URL copied"); }}>
                            <Copy className="w-3 h-3 mr-1" />Copy URL
                          </Button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      )}

      {tab === "analytics" && (
        <div className="space-y-6">
          {/* Hourly call volume chart */}
          <div className="instrument-card p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-display font-semibold text-sm text-foreground">MCP Call Volume</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Tool invocations per hour (last 24h)</p>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={hourlyMcpCalls}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="hour" tick={{ fontSize: 9, fill: "#6B7A90" }} axisLine={false} tickLine={false} interval={3} />
                <YAxis tick={{ fontSize: 9, fill: "#6B7A90" }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="calls" fill="#14b8a6" radius={[2, 2, 0, 0]} name="Calls" />
                <Bar dataKey="denied" fill="#EF4444" radius={[2, 2, 0, 0]} name="Denied" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Per-server breakdown */}
          <div className="instrument-card overflow-hidden">
            <div className="px-5 py-3 border-b border-border">
              <h3 className="font-display font-semibold text-sm text-foreground">Server Breakdown</h3>
            </div>
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-surface-0">
                  <th className="text-left px-5 py-2 text-[10px] font-mono font-medium text-muted-foreground uppercase tracking-widest">Server</th>
                  <th className="text-left px-5 py-2 text-[10px] font-mono font-medium text-muted-foreground uppercase tracking-widest">Tools</th>
                  <th className="text-left px-5 py-2 text-[10px] font-mono font-medium text-muted-foreground uppercase tracking-widest">Calls (24h)</th>
                  <th className="text-left px-5 py-2 text-[10px] font-mono font-medium text-muted-foreground uppercase tracking-widest">Denied</th>
                  <th className="text-left px-5 py-2 text-[10px] font-mono font-medium text-muted-foreground uppercase tracking-widest">Avg Latency</th>
                  <th className="text-left px-5 py-2 text-[10px] font-mono font-medium text-muted-foreground uppercase tracking-widest">Policy Bindings</th>
                </tr>
              </thead>
              <tbody>
                {servers.map((srv) => (
                  <tr key={srv.id} className="border-b border-border hover:bg-surface-1 transition-colors">
                    <td className="px-5 py-2.5">
                      <div className="flex items-center gap-2">
                        <Plug className="w-3.5 h-3.5 text-cordum" />
                        <span className="text-sm font-medium text-foreground">{srv.name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-2.5 font-mono text-sm text-foreground">{srv.tools.length}</td>
                    <td className="px-5 py-2.5 font-mono text-sm text-foreground">{(srv.total_calls_24h ?? 0).toLocaleString()}</td>
                    <td className="px-5 py-2.5 font-mono text-sm">
                      <span className={cn((srv.denied_calls_24h ?? 0) > 0 ? "text-red-400" : "text-foreground")}>
                        {srv.denied_calls_24h ?? 0}
                      </span>
                    </td>
                    <td className="px-5 py-2.5 font-mono text-sm text-foreground">{srv.avg_latency_ms}ms</td>
                    <td className="px-5 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {(srv.policy_bindings ?? []).map((b) => (
                          <span key={b} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cordum/10 text-cordum">{b}</span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Top tools by call volume */}
          <div className="instrument-card overflow-hidden">
            <div className="px-5 py-3 border-b border-border">
              <h3 className="font-display font-semibold text-sm text-foreground">Top Tools by Call Volume</h3>
            </div>
            <div className="divide-y divide-border">
              {servers
                .flatMap((srv) => srv.tools.map((t) => ({ ...t, server: srv.name })))
                .sort((a, b) => (b.call_count_24h ?? 0) - (a.call_count_24h ?? 0))
                .slice(0, 10)
                .map((tool, idx) => (
                  <div key={`${tool.server}-${tool.name}`} className="flex items-center gap-4 px-5 py-2.5 hover:bg-surface-1 transition-colors">
                    <span className="text-xs font-mono text-muted-foreground w-6 text-right">{idx + 1}</span>
                    <Wrench className="w-3 h-3 text-cordum shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-mono font-medium text-foreground">{tool.name}</span>
                      <span className="text-[10px] text-muted-foreground ml-2">{tool.server}</span>
                    </div>
                    <span className="font-mono text-xs text-foreground">{(tool.call_count_24h ?? 0).toLocaleString()}</span>
                    <span className="font-mono text-xs text-muted-foreground">{tool.avg_latency_ms}ms</span>
                    <PolicyBadge decision={tool.policy_decision} />
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}
