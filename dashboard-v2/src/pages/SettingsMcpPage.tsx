/*
 * DESIGN: "Control Surface" — MCP Server
 * PRD Section 32: MCP server management with tool discovery
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { get } from "@/api/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonCard } from "@/components/ui/Skeleton";
import { Server, Plug, RefreshCw, Copy, ChevronDown, ChevronRight, Wrench, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface McpServer {
  id: string;
  name: string;
  url: string;
  status: "connected" | "disconnected" | "error";
  tools: { name: string; description: string }[];
  lastPing: string;
}

export default function SettingsMcpPage() {
  const [expandedServer, setExpandedServer] = useState<string | null>(null);

  const { data: servers, isLoading } = useQuery({
    queryKey: ["mcp-servers"],
    queryFn: async () => {
      const res: any = await get("/api/mcp/servers");
      return (res.data || []) as McpServer[];
    },
  });

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <PageHeader title="MCP Servers" subtitle="Connect and manage Model Context Protocol servers" actions={<><Button variant="primary" size="sm" onClick={() => toast.info("Feature coming soon")}>
          <Plus className="w-3 h-3 mr-1" />Add Server
        </Button></>} />

      {isLoading ? (
        <div className="space-y-4">{Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}</div>
      ) : !servers?.length ? (
        <EmptyState icon={<Server className="w-8 h-8" />} title="No MCP servers" description="Connect an MCP server to extend agent capabilities" />
      ) : (
        <div className="space-y-3">
          {servers.map((server, i) => {
            const isExpanded = expandedServer === server.id;
            return (
              <motion.div key={server.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                className={cn("instrument-card overflow-hidden", server.status === "connected" && "status-healthy")}>
                <div className="p-5 cursor-pointer" onClick={() => setExpandedServer(isExpanded ? null : server.id)}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Plug className="w-4 h-4 text-cordum" />
                      <div>
                        <span className="text-sm font-display font-semibold text-foreground">{server.name}</span>
                        <p className="text-xs font-mono text-muted-foreground mt-0.5">{server.url}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <StatusBadge variant={server.status === "connected" ? "healthy" : server.status === "error" ? "danger" : "muted"} dot>
                        {server.status}
                      </StatusBadge>
                      <span className="text-[10px] text-muted-foreground">{server.tools.length} tools</span>
                      {isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                    </div>
                  </div>
                </div>
                {isExpanded && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} className="border-t border-border">
                    <div className="p-4">
                      <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-3">Available Tools</p>
                      <div className="space-y-2">
                        {server.tools.map(tool => (
                          <div key={tool.name} className="flex items-start gap-2 px-3 py-2 rounded-md bg-surface-1">
                            <Wrench className="w-3 h-3 text-cordum mt-0.5 shrink-0" />
                            <div>
                              <span className="text-xs font-mono font-medium text-foreground">{tool.name}</span>
                              <p className="text-[10px] text-muted-foreground">{tool.description}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="px-4 pb-4 flex gap-2">
                      <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); toast.info("Refreshing tools..."); }}>
                        <RefreshCw className="w-3 h-3 mr-1" />Refresh
                      </Button>
                      <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(server.url); toast.success("URL copied"); }}>
                        <Copy className="w-3 h-3 mr-1" />Copy URL
                      </Button>
                    </div>
                  </motion.div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}
