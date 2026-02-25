/*
 * DESIGN: "Control Surface" — Packs
 * PRD Section 21: Browse and manage capability packs
 */
import { useState } from "react";
import { motion } from "framer-motion";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  Package, Search, Settings, Trash2, Download, Star, ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const INSTALLED_PACKS = [
  { name: "slack", version: "1.2.0", desc: "Slack ChatOps notifications", topics: ["job.slack.send", "job.slack.approve"], workflows: 2, schemas: 3 },
  { name: "github", version: "2.0.1", desc: "GitHub PR and issue automation", topics: ["job.github.create-pr", "job.github.review"], workflows: 1, schemas: 4 },
  { name: "jira", version: "1.0.3", desc: "Jira ticket management", topics: ["job.jira.create-issue", "job.jira.update"], workflows: 3, schemas: 2 },
];

const MARKETPLACE_PACKS = [
  { name: "datadog", version: "1.1.0", desc: "Datadog monitoring integration", stars: 142, downloads: 2340 },
  { name: "pagerduty", version: "0.9.2", desc: "PagerDuty incident management", stars: 89, downloads: 1560 },
  { name: "aws-s3", version: "1.3.0", desc: "AWS S3 file operations", stars: 234, downloads: 4120 },
  { name: "postgres", version: "2.1.0", desc: "PostgreSQL database operations", stars: 312, downloads: 5890 },
  { name: "redis", version: "1.0.0", desc: "Redis cache operations", stars: 67, downloads: 890 },
  { name: "email", version: "1.2.1", desc: "SMTP email sending", stars: 178, downloads: 3210 },
];

export default function PacksPage() {
  const [activeTab, setActiveTab] = useState("installed");
  const [search, setSearch] = useState("");

  return (
    <div className="space-y-6">
      <PageHeader label="Extend" title="Packs" subtitle="Browse and install capability packs from the catalog" />

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1 bg-surface-1 border border-border rounded-md p-0.5">
          {["installed", "marketplace"].map(t => (
            <button key={t} onClick={() => setActiveTab(t)} className={cn("px-4 py-1.5 text-xs font-medium rounded transition-colors capitalize", activeTab === t ? "bg-cordum/10 text-cordum" : "text-muted-foreground hover:text-foreground")}>
              {t}
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input type="text" placeholder="Search packs..." value={search} onChange={(e) => setSearch(e.target.value)} className="h-8 w-full pl-8 pr-3 text-xs bg-surface-1 border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-cordum" />
        </div>
      </div>

      {activeTab === "installed" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {INSTALLED_PACKS.filter(p => !search || p.name.includes(search.toLowerCase())).map((pack, i) => (
            <motion.div key={pack.name} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="instrument-card p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Package className="w-5 h-5 text-cordum" />
                  <span className="font-display font-semibold text-foreground">{pack.name}</span>
                </div>
                <span className="text-xs font-mono text-muted-foreground">v{pack.version}</span>
              </div>
              <p className="text-xs text-muted-foreground mb-3">{pack.desc}</p>
              <div className="space-y-1.5 mb-4">
                <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Topics</p>
                <div className="flex flex-wrap gap-1">
                  {pack.topics.map(t => (
                    <span key={t} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-surface-2 text-cordum">{t}</span>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-4 text-xs text-muted-foreground mb-4">
                <span>Workflows: <span className="font-mono text-foreground">{pack.workflows}</span></span>
                <span>Schemas: <span className="font-mono text-foreground">{pack.schemas}</span></span>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1"><Settings className="w-3 h-3 mr-1" />Configure</Button>
                <Button variant="danger" size="sm" onClick={() => toast.info("Feature coming soon")}><Trash2 className="w-3 h-3" /></Button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {activeTab === "marketplace" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {MARKETPLACE_PACKS.filter(p => !search || p.name.includes(search.toLowerCase())).map((pack, i) => (
            <motion.div key={pack.name} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="instrument-card p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Package className="w-5 h-5 text-muted-foreground" />
                  <span className="font-display font-semibold text-foreground">{pack.name}</span>
                </div>
                <span className="text-xs font-mono text-muted-foreground">v{pack.version}</span>
              </div>
              <p className="text-xs text-muted-foreground mb-4">{pack.desc}</p>
              <div className="flex items-center gap-4 text-xs text-muted-foreground mb-4">
                <span className="flex items-center gap-1"><Star className="w-3 h-3" />{pack.stars}</span>
                <span className="flex items-center gap-1"><Download className="w-3 h-3" />{pack.downloads.toLocaleString()}</span>
              </div>
              <Button variant="primary" size="sm" className="w-full" onClick={() => toast.success(`${pack.name} installed!`)}>
                <Download className="w-3 h-3 mr-1" />Install
              </Button>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
