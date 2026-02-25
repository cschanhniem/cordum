/*
 * DESIGN: "Control Surface" — Settings: MCP Server
 * PRD Section 30: MCP server configuration
 */
import { useState } from "react";
import { motion } from "framer-motion";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  Server, Copy, RefreshCw, Settings, Plug,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const TOOLS = [
  { name: "cordum_submit_job", desc: "Submit a new job to the control plane", calls24h: 1240 },
  { name: "cordum_get_job", desc: "Get job status and details", calls24h: 3420 },
  { name: "cordum_list_workers", desc: "List all registered workers", calls24h: 890 },
  { name: "cordum_approve", desc: "Approve or deny a pending approval", calls24h: 67 },
  { name: "cordum_run_workflow", desc: "Trigger a workflow run", calls24h: 234 },
  { name: "cordum_get_policy", desc: "Get policy evaluation result", calls24h: 1560 },
];

export default function SettingsMCPPage() {
  const endpoint = "https://mcp.cordum.io/v1";
  const [isConnected] = useState(true);

  return (
    <div className="space-y-6">
      <PageHeader label="Settings" title="MCP Server" subtitle="Model Context Protocol server configuration for AI agent integration" />

      {/* Connection Info */}
      <div className="instrument-card p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Plug className="w-4 h-4 text-cordum" />
            <h3 className="font-display font-semibold text-sm text-foreground">Connection</h3>
          </div>
          <StatusBadge variant={isConnected ? "healthy" : "danger"} dot pulse={isConnected}>
            {isConnected ? "Connected" : "Disconnected"}
          </StatusBadge>
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Endpoint</span>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm text-cordum">{endpoint}</span>
              <button onClick={() => { navigator.clipboard.writeText(endpoint); toast.success("Copied"); }} className="p-1 rounded hover:bg-surface-2 transition-colors">
                <Copy className="w-3 h-3 text-muted-foreground" />
              </button>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Protocol</span>
            <span className="font-mono text-sm text-foreground">MCP v1.0</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Transport</span>
            <span className="font-mono text-sm text-foreground">SSE (Server-Sent Events)</span>
          </div>
        </div>
      </div>

      {/* Available Tools */}
      <div className="instrument-card overflow-hidden">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <h3 className="font-display font-semibold text-sm text-foreground">Available Tools ({TOOLS.length})</h3>
          <Button variant="ghost" size="sm"><RefreshCw className="w-3 h-3 mr-1" />Refresh</Button>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-surface-0">
              <th className="text-left px-5 py-3 text-xs font-mono font-medium text-muted-foreground uppercase tracking-wider">Tool</th>
              <th className="text-left px-5 py-3 text-xs font-mono font-medium text-muted-foreground uppercase tracking-wider">Description</th>
              <th className="text-left px-5 py-3 text-xs font-mono font-medium text-muted-foreground uppercase tracking-wider">Calls (24h)</th>
            </tr>
          </thead>
          <tbody>
            {TOOLS.map(t => (
              <tr key={t.name} className="border-b border-border hover:bg-surface-1 transition-colors">
                <td className="px-5 py-3 font-mono text-sm text-cordum">{t.name}</td>
                <td className="px-5 py-3 text-sm text-foreground">{t.desc}</td>
                <td className="px-5 py-3 font-mono text-sm text-muted-foreground">{t.calls24h.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Config snippet */}
      <div className="instrument-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Settings className="w-4 h-4 text-cordum" />
          <h3 className="font-display font-semibold text-sm text-foreground">Agent Configuration</h3>
        </div>
        <div className="rounded-md bg-surface-0 border border-border p-4 font-mono text-xs text-foreground overflow-auto">
          <pre>{`{
  "mcpServers": {
    "cordum": {
      "url": "${endpoint}",
      "transport": "sse",
      "headers": {
        "Authorization": "Bearer <YOUR_API_KEY>"
      }
    }
  }
}`}</pre>
        </div>
        <Button variant="ghost" size="sm" className="mt-3" onClick={() => toast.success("Copied")}>
          <Copy className="w-3 h-3 mr-1" />Copy Config
        </Button>
      </div>
    </div>
  );
}
