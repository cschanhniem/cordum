/*
 * DESIGN: "Control Surface" — Settings: Environments
 * PRD Section 27: Environment management
 */
import { useState } from "react";
import { motion } from "framer-motion";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  Globe, Plus, Settings, Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const ENVS = [
  { id: "e1", name: "production", label: "Production", status: "active", workers: 12, jobs24h: 8420, region: "us-east-1" },
  { id: "e2", name: "staging", label: "Staging", status: "active", workers: 4, jobs24h: 1230, region: "us-east-1" },
  { id: "e3", name: "development", label: "Development", status: "active", workers: 2, jobs24h: 340, region: "us-west-2" },
  { id: "e4", name: "canary", label: "Canary", status: "inactive", workers: 0, jobs24h: 0, region: "eu-west-1" },
];

export default function SettingsEnvironmentsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        label="Settings"
        title="Environments"
        subtitle="Manage deployment environments"
        actions={<Button variant="primary" size="sm"><Plus className="w-3 h-3 mr-1" />Add Environment</Button>}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {ENVS.map((env, i) => (
          <motion.div key={env.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className={cn("instrument-card p-5", env.name === "production" && "ring-1 ring-cordum/20")}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Globe className={cn("w-4 h-4", env.name === "production" ? "text-cordum" : "text-muted-foreground")} />
                <span className="font-display font-semibold text-foreground">{env.label}</span>
                {env.name === "production" && <StatusBadge variant="cordum">primary</StatusBadge>}
              </div>
              <StatusBadge variant={env.status === "active" ? "healthy" : "muted"}>{env.status}</StatusBadge>
            </div>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div>
                <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Workers</p>
                <p className="font-mono text-lg font-bold text-foreground">{env.workers}</p>
              </div>
              <div>
                <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Jobs (24h)</p>
                <p className="font-mono text-lg font-bold text-foreground">{env.jobs24h.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Region</p>
                <p className="font-mono text-sm text-foreground">{env.region}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="flex-1" onClick={() => toast.info("Feature coming soon")}><Settings className="w-3 h-3 mr-1" />Configure</Button>
              {env.name !== "production" && (
                <Button variant="danger" size="sm" onClick={() => toast.info("Feature coming soon")}><Trash2 className="w-3 h-3" /></Button>
              )}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
