/*
 * DESIGN: "Control Surface" — Settings: API Keys
 * PRD Section 29: API key management
 */
import { useState } from "react";
import { motion } from "framer-motion";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  Key, Plus, Copy, Trash2, Eye, EyeOff,
} from "lucide-react";
import { toast } from "sonner";

const KEYS = [
  { id: "k1", name: "Production API", prefix: "crd_prod_", created: "2w ago", lastUsed: "1h ago", status: "active", scopes: ["read", "write", "admin"] },
  { id: "k2", name: "CI/CD Pipeline", prefix: "crd_ci_", created: "1m ago", lastUsed: "3h ago", status: "active", scopes: ["read", "write"] },
  { id: "k3", name: "Monitoring", prefix: "crd_mon_", created: "3m ago", lastUsed: "2d ago", status: "active", scopes: ["read"] },
  { id: "k4", name: "Legacy Key", prefix: "crd_leg_", created: "6m ago", lastUsed: "1m ago", status: "expired", scopes: ["read", "write"] },
];

export default function SettingsApiKeysPage() {
  const [showKey, setShowKey] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <PageHeader
        label="Settings"
        title="API Keys"
        subtitle="Manage API keys for programmatic access"
        actions={<Button variant="primary" size="sm"><Plus className="w-3 h-3 mr-1" />Generate Key</Button>}
      />

      <div className="instrument-card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-surface-0">
              <th className="text-left px-5 py-3 text-xs font-mono font-medium text-muted-foreground uppercase tracking-wider">Name</th>
              <th className="text-left px-5 py-3 text-xs font-mono font-medium text-muted-foreground uppercase tracking-wider">Key</th>
              <th className="text-left px-5 py-3 text-xs font-mono font-medium text-muted-foreground uppercase tracking-wider">Scopes</th>
              <th className="text-left px-5 py-3 text-xs font-mono font-medium text-muted-foreground uppercase tracking-wider">Status</th>
              <th className="text-left px-5 py-3 text-xs font-mono font-medium text-muted-foreground uppercase tracking-wider">Last Used</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {KEYS.map(k => (
              <tr key={k.id} className="border-b border-border hover:bg-surface-1 transition-colors">
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2">
                    <Key className="w-4 h-4 text-cordum" />
                    <span className="text-sm font-medium text-foreground">{k.name}</span>
                  </div>
                </td>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">
                      {showKey === k.id ? `${k.prefix}${"x".repeat(24)}` : `${k.prefix}${"•".repeat(16)}`}
                    </span>
                    <button onClick={() => setShowKey(showKey === k.id ? null : k.id)} className="p-0.5 rounded hover:bg-surface-2 transition-colors">
                      {showKey === k.id ? <EyeOff className="w-3 h-3 text-muted-foreground" /> : <Eye className="w-3 h-3 text-muted-foreground" />}
                    </button>
                    <button onClick={() => { navigator.clipboard.writeText(`${k.prefix}xxxx`); toast.success("Copied"); }} className="p-0.5 rounded hover:bg-surface-2 transition-colors">
                      <Copy className="w-3 h-3 text-muted-foreground" />
                    </button>
                  </div>
                </td>
                <td className="px-5 py-3">
                  <div className="flex gap-1">
                    {k.scopes.map(s => (
                      <span key={s} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-surface-2 text-muted-foreground">{s}</span>
                    ))}
                  </div>
                </td>
                <td className="px-5 py-3">
                  <StatusBadge variant={k.status === "active" ? "healthy" : "danger"}>{k.status}</StatusBadge>
                </td>
                <td className="px-5 py-3 text-sm text-muted-foreground">{k.lastUsed}</td>
                <td className="px-5 py-3">
                  <button onClick={() => toast.info("Feature coming soon")} className="p-1 rounded hover:bg-surface-2 text-muted-foreground hover:text-red-400 transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
