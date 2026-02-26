/*
 * DESIGN: "Control Surface" — Schemas Registry
 * PRD Section 21: Schema management with type filtering
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { get } from "@/api/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonTable } from "@/components/ui/Skeleton";
import { Search, Plus, FileJson, Filter, ExternalLink } from "lucide-react";
import { cn, formatRelativeTime } from "@/lib/utils";

interface Schema {
  id: string;
  name: string;
  type: "input" | "output" | "config";
  version: string;
  updatedAt: string;
  fieldCount: number;
}

export default function SchemasPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const { data: schemas, isLoading, error } = useQuery({
    queryKey: ["schemas"],
    queryFn: async () => {
      const res: any = await get("/schemas");
      return (res.data || []) as Schema[];
    },
  });

  const types = ["all", "input", "output", "config"];
  const filtered = (schemas || []).filter(s => {
    const matchType = typeFilter === "all" || s.type === typeFilter;
    const matchSearch = !search || s.name.toLowerCase().includes(search.toLowerCase());
    return matchType && matchSearch;
  });

  const typeColor = (t: string) => {
    switch (t) {
      case "input": return "healthy";
      case "output": return "info";
      case "config": return "warning";
      default: return "muted";
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <PageHeader title="Schemas" subtitle="Define and manage data schemas for jobs and workflows" actions={<><Button variant="primary" size="sm" onClick={() => navigate("/schemas/new")}>
          <Plus className="w-3 h-3 mr-1" />Register Schema
        </Button></>} />

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1 p-1 rounded-lg bg-surface-1">
          {types.map(t => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-md transition-colors capitalize",
                typeFilter === t ? "bg-cordum/10 text-cordum" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search schemas..."
            className="h-8 w-full pl-9 pr-3 text-xs bg-surface-1 border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-cordum"
          />
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <SkeletonTable rows={6} />
      ) : error ? (
        <div className="instrument-card p-8 text-center">
          <p className="text-sm text-red-400">Failed to load schemas</p>
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={<FileJson className="w-8 h-8" />} title="No schemas found" description="Register a schema to define data contracts" />
      ) : (
        <div className="instrument-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-0">
                <th className="text-left px-4 py-3 text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Name</th>
                <th className="text-left px-4 py-3 text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Type</th>
                <th className="text-left px-4 py-3 text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Version</th>
                <th className="text-left px-4 py-3 text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Fields</th>
                <th className="text-left px-4 py-3 text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Updated</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((schema, i) => (
                <motion.tr
                  key={schema.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.03 }}
                  onClick={() => navigate(`/schemas/${schema.id}`)}
                  className="border-b border-border last:border-0 hover:bg-surface-1 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <FileJson className="w-3.5 h-3.5 text-cordum" />
                      <span className="font-medium text-foreground">{schema.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3"><StatusBadge variant={typeColor(schema.type) as any}>{schema.type}</StatusBadge></td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{schema.version}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{schema.fieldCount} fields</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{formatRelativeTime(schema.updatedAt)}</td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </motion.div>
  );
}
