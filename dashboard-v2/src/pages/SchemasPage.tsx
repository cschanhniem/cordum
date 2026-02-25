/*
 * DESIGN: "Control Surface" — Schemas
 * PRD Section 22-23: Schema management
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  FileJson, Plus, Search, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

const SCHEMAS = [
  { id: "sch-1", name: "job.slack.send", version: 3, fields: 8, status: "active", updatedAt: "2h ago" },
  { id: "sch-2", name: "job.github.create-pr", version: 2, fields: 12, status: "active", updatedAt: "1d ago" },
  { id: "sch-3", name: "job.data.transform", version: 5, fields: 15, status: "active", updatedAt: "3d ago" },
  { id: "sch-4", name: "job.email.send", version: 1, fields: 6, status: "draft", updatedAt: "5d ago" },
];

export default function SchemasPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");

  const filtered = SCHEMAS.filter(s => !search || s.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-6">
      <PageHeader
        label="Extend"
        title="Schemas"
        subtitle="Manage input/output schemas for job validation"
        actions={<Button variant="primary" size="sm"><Plus className="w-3 h-3 mr-1" />Register Schema</Button>}
      />

      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <input type="text" placeholder="Search schemas..." value={search} onChange={(e) => setSearch(e.target.value)} className="h-8 w-full pl-8 pr-3 text-xs bg-surface-1 border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-cordum" />
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={<FileJson className="w-5 h-5" />} title="No schemas found" description="Register your first schema to enable input/output validation" />
      ) : (
        <div className="instrument-card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-surface-0">
                <th className="text-left px-5 py-3 text-xs font-mono font-medium text-muted-foreground uppercase tracking-wider">Schema</th>
                <th className="text-left px-5 py-3 text-xs font-mono font-medium text-muted-foreground uppercase tracking-wider">Version</th>
                <th className="text-left px-5 py-3 text-xs font-mono font-medium text-muted-foreground uppercase tracking-wider">Fields</th>
                <th className="text-left px-5 py-3 text-xs font-mono font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="text-left px-5 py-3 text-xs font-mono font-medium text-muted-foreground uppercase tracking-wider">Updated</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id} className="border-b border-border hover:bg-surface-1 transition-colors cursor-pointer" onClick={() => navigate(`/schemas/${s.id}`)}>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <FileJson className="w-4 h-4 text-cordum" />
                      <span className="text-sm font-mono text-foreground">{s.name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 font-mono text-sm text-muted-foreground">v{s.version}</td>
                  <td className="px-5 py-3 font-mono text-sm text-foreground">{s.fields}</td>
                  <td className="px-5 py-3"><StatusBadge variant={s.status === "active" ? "healthy" : "info"}>{s.status}</StatusBadge></td>
                  <td className="px-5 py-3 text-sm text-muted-foreground">{s.updatedAt}</td>
                  <td className="px-5 py-3"><ChevronRight className="w-4 h-4 text-muted-foreground" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
