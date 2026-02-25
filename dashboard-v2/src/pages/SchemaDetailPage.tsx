/*
 * DESIGN: "Control Surface" — Schema Detail
 * PRD Section 23: Schema detail with field editor and version history
 */
import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  ArrowLeft, FileJson, Plus, Trash2, Copy, Save, Code,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const MOCK_FIELDS = [
  { name: "channel", type: "string", required: true, desc: "Slack channel ID" },
  { name: "message", type: "string", required: true, desc: "Message body" },
  { name: "thread_ts", type: "string", required: false, desc: "Thread timestamp" },
  { name: "blocks", type: "array", required: false, desc: "Block Kit blocks" },
  { name: "unfurl_links", type: "boolean", required: false, desc: "Unfurl links" },
  { name: "metadata", type: "object", required: false, desc: "Metadata payload" },
];

const VERSIONS = [
  { version: 3, date: "2h ago", author: "admin@cordum.io", changes: "Added metadata field" },
  { version: 2, date: "5d ago", author: "ops@cordum.io", changes: "Made thread_ts optional" },
  { version: 1, date: "2w ago", author: "admin@cordum.io", changes: "Initial version" },
];

const FIELD_TYPES = ["string", "number", "boolean", "array", "object"];

export default function SchemaDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("fields");
  const [fields, setFields] = useState(MOCK_FIELDS);

  const jsonPreview = JSON.stringify({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    properties: Object.fromEntries(
      fields.map(f => [f.name, { type: f.type, description: f.desc }])
    ),
    required: fields.filter(f => f.required).map(f => f.name),
  }, null, 2);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate("/schemas")} className="p-2 rounded-md hover:bg-surface-2 transition-colors">
          <ArrowLeft className="w-4 h-4 text-muted-foreground" />
        </button>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cordum/10 border border-cordum/20 flex items-center justify-center">
            <FileJson className="w-5 h-5 text-cordum" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold font-display text-foreground">job.slack.send</h1>
              <StatusBadge variant="healthy">active</StatusBadge>
              <span className="text-xs font-mono text-muted-foreground">v3</span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">Schema ID: {id}</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-surface-1 border border-border rounded-md p-0.5 w-fit">
        {["fields", "json", "versions"].map(t => (
          <button key={t} onClick={() => setActiveTab(t)} className={cn("px-4 py-1.5 text-xs font-medium rounded transition-colors capitalize", activeTab === t ? "bg-cordum/10 text-cordum" : "text-muted-foreground hover:text-foreground")}>
            {t}
          </button>
        ))}
      </div>

      {/* Fields Tab */}
      {activeTab === "fields" && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          <div className="instrument-card overflow-hidden">
            <div className="px-5 py-3 border-b border-border flex items-center justify-between">
              <h3 className="font-display font-semibold text-sm text-foreground">Fields ({fields.length})</h3>
              <Button variant="outline" size="sm" onClick={() => setFields(prev => [...prev, { name: "", type: "string", required: false, desc: "" }])}>
                <Plus className="w-3 h-3 mr-1" />Add Field
              </Button>
            </div>
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-surface-0">
                  <th className="text-left px-5 py-3 text-xs font-mono font-medium text-muted-foreground uppercase tracking-wider">Name</th>
                  <th className="text-left px-5 py-3 text-xs font-mono font-medium text-muted-foreground uppercase tracking-wider">Type</th>
                  <th className="text-left px-5 py-3 text-xs font-mono font-medium text-muted-foreground uppercase tracking-wider">Required</th>
                  <th className="text-left px-5 py-3 text-xs font-mono font-medium text-muted-foreground uppercase tracking-wider">Description</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {fields.map((f, i) => (
                  <tr key={i} className="border-b border-border hover:bg-surface-1 transition-colors">
                    <td className="px-5 py-2">
                      <input type="text" value={f.name} onChange={(e) => { const nf = [...fields]; nf[i] = { ...nf[i], name: e.target.value }; setFields(nf); }} className="h-7 w-full px-2 text-xs font-mono bg-transparent border border-transparent hover:border-border focus:border-cordum rounded text-foreground focus:outline-none" />
                    </td>
                    <td className="px-5 py-2">
                      <select value={f.type} onChange={(e) => { const nf = [...fields]; nf[i] = { ...nf[i], type: e.target.value }; setFields(nf); }} className="h-7 px-2 text-xs bg-transparent border border-transparent hover:border-border focus:border-cordum rounded text-foreground focus:outline-none">
                        {FIELD_TYPES.map(t => <option key={t}>{t}</option>)}
                      </select>
                    </td>
                    <td className="px-5 py-2">
                      <input type="checkbox" checked={f.required} onChange={(e) => { const nf = [...fields]; nf[i] = { ...nf[i], required: e.target.checked }; setFields(nf); }} className="w-4 h-4 rounded border-border text-cordum focus:ring-cordum" />
                    </td>
                    <td className="px-5 py-2">
                      <input type="text" value={f.desc} onChange={(e) => { const nf = [...fields]; nf[i] = { ...nf[i], desc: e.target.value }; setFields(nf); }} className="h-7 w-full px-2 text-xs bg-transparent border border-transparent hover:border-border focus:border-cordum rounded text-foreground focus:outline-none" />
                    </td>
                    <td className="px-5 py-2">
                      <button onClick={() => setFields(prev => prev.filter((_, j) => j !== i))} className="p-1 rounded hover:bg-surface-2 text-muted-foreground hover:text-red-400 transition-colors">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button variant="primary" size="sm" onClick={() => toast.success("Schema saved")}><Save className="w-3 h-3 mr-1" />Save Changes</Button>
        </motion.div>
      )}

      {/* JSON Tab */}
      {activeTab === "json" && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="instrument-card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Code className="w-4 h-4 text-cordum" />
              <h3 className="font-display font-semibold text-sm text-foreground">JSON Schema</h3>
            </div>
            <Button variant="ghost" size="sm" onClick={() => { navigator.clipboard.writeText(jsonPreview); toast.success("Copied"); }}>
              <Copy className="w-3 h-3 mr-1" />Copy
            </Button>
          </div>
          <div className="rounded-md bg-surface-0 border border-border p-4 font-mono text-xs text-foreground overflow-auto max-h-[500px]">
            <pre>{jsonPreview}</pre>
          </div>
        </motion.div>
      )}

      {/* Versions Tab */}
      {activeTab === "versions" && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="instrument-card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-surface-0">
                <th className="text-left px-5 py-3 text-xs font-mono font-medium text-muted-foreground uppercase tracking-wider">Version</th>
                <th className="text-left px-5 py-3 text-xs font-mono font-medium text-muted-foreground uppercase tracking-wider">Date</th>
                <th className="text-left px-5 py-3 text-xs font-mono font-medium text-muted-foreground uppercase tracking-wider">Author</th>
                <th className="text-left px-5 py-3 text-xs font-mono font-medium text-muted-foreground uppercase tracking-wider">Changes</th>
              </tr>
            </thead>
            <tbody>
              {VERSIONS.map(v => (
                <tr key={v.version} className="border-b border-border hover:bg-surface-1 transition-colors">
                  <td className="px-5 py-3 font-mono text-sm text-cordum">v{v.version}</td>
                  <td className="px-5 py-3 text-sm text-muted-foreground">{v.date}</td>
                  <td className="px-5 py-3 text-sm text-foreground">{v.author}</td>
                  <td className="px-5 py-3 text-sm text-foreground">{v.changes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </motion.div>
      )}
    </div>
  );
}
