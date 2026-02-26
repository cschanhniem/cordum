/*
 * DESIGN: "Control Surface" — Policy Builder v2
 * Spec: WHERE → WHEN → THEN visual builder with scope selector,
 * conditions, constraints, and live YAML preview.
 */
import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { PolicyStudioLayout } from "@/components/layout/PolicyStudioLayout";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  Plus, Trash2, GripVertical, Play, Save, Code2,
  Shield, Layers, ChevronDown, ChevronRight, Zap, Copy,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { usePolicyBundles } from "@/hooks/usePolicies";
import { useWorkflows } from "@/hooks/useWorkflows";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const SCOPES = ["global", "workflow", "tenant"] as const;
type Scope = (typeof SCOPES)[number];

const MATCH_FIELDS = [
  { value: "topics", label: "Topic" },
  { value: "risk_tags", label: "Risk Tag" },
  { value: "capabilities", label: "Capability" },
  { value: "pools", label: "Pool" },
  { value: "tenants", label: "Tenant" },
  { value: "actor_type", label: "Actor Type" },
  { value: "mcp_server", label: "MCP Server" },
  { value: "mcp_tool", label: "MCP Tool" },
] as const;

const OPERATORS = ["contains", "equals", "not_equals", "matches", "in"] as const;

const DECISIONS = [
  { value: "allow", label: "Allow" },
  { value: "deny", label: "Deny" },
  { value: "require_approval", label: "Require Approval" },
  { value: "allow_with_constraints", label: "Allow w/ Constraints" },
  { value: "throttle", label: "Throttle" },
] as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface Condition {
  id: string;
  field: string;
  operator: string;
  value: string;
}

interface RuleBlock {
  id: string;
  name: string;
  priority: number;
  decision: string;
  reason: string;
  conditions: Condition[];
  maxConcurrency: string;
  rateLimit: string;
  timeout: string;
  sandbox: boolean;
  expanded: boolean;
}

function makeId() {
  return crypto.randomUUID().slice(0, 8);
}

function newCondition(): Condition {
  return { id: makeId(), field: "topics", operator: "contains", value: "" };
}

function newBlock(priority: number): RuleBlock {
  return {
    id: makeId(),
    name: `rule-${priority}`,
    priority,
    decision: "allow",
    reason: "",
    conditions: [newCondition()],
    maxConcurrency: "",
    rateLimit: "",
    timeout: "",
    sandbox: false,
    expanded: true,
  };
}

// ---------------------------------------------------------------------------
// YAML Preview (simple serializer)
// ---------------------------------------------------------------------------
function blocksToYaml(blocks: RuleBlock[], scope: Scope, workflowId: string, tenantId: string): string {
  const lines: string[] = ["rules:"];
  for (const b of blocks) {
    lines.push(`  - name: ${b.name}`);
    lines.push(`    priority: ${b.priority}`);
    lines.push(`    decision: ${b.decision}`);
    if (b.reason) lines.push(`    reason: "${b.reason}"`);
    lines.push(`    match:`);
    for (const c of b.conditions) {
      if (!c.value.trim()) continue;
      const vals = c.value.split(",").map((v) => v.trim()).filter(Boolean);
      if (vals.length === 1) {
        lines.push(`      ${c.field}: ${vals[0]}`);
      } else {
        lines.push(`      ${c.field}:`);
        for (const v of vals) lines.push(`        - ${v}`);
      }
    }
    if (scope === "workflow" && workflowId) lines.push(`      workflow_id: ${workflowId}`);
    if (scope === "tenant" && tenantId) lines.push(`      tenants:\n        - ${tenantId}`);
    if (b.decision === "allow_with_constraints" || b.decision === "throttle") {
      const hasC = b.maxConcurrency || b.rateLimit || b.timeout || b.sandbox;
      if (hasC) {
        lines.push(`    constraints:`);
        if (b.maxConcurrency) lines.push(`      max_concurrency: ${b.maxConcurrency}`);
        if (b.rateLimit) lines.push(`      rate_limit: "${b.rateLimit}"`);
        if (b.timeout) lines.push(`      timeout: "${b.timeout}"`);
        if (b.sandbox) lines.push(`      sandbox:\n        enabled: true`);
      }
    }
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function decisionVariant(d: string) {
  switch (d) {
    case "allow": return "healthy" as const;
    case "deny": return "danger" as const;
    case "require_approval": return "warning" as const;
    case "allow_with_constraints": return "info" as const;
    case "throttle": return "warning" as const;
    default: return "muted" as const;
  }
}

function decisionStatusClass(d: string) {
  switch (d) {
    case "deny": return "status-danger";
    case "require_approval": case "throttle": return "status-warning";
    case "allow_with_constraints": return "status-info";
    default: return "";
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function PoliciesBuilderPage() {
  const { data: bundlesData } = usePolicyBundles();
  const { data: workflowsData } = useWorkflows();
  const bundles = bundlesData?.items ?? [];
  const workflows = workflowsData ?? [];

  const [scope, setScope] = useState<Scope>("global");
  const [workflowId, setWorkflowId] = useState("");
  const [tenantId, setTenantId] = useState("");
  const [selectedBundleId, setSelectedBundleId] = useState("");
  const [blocks, setBlocks] = useState<RuleBlock[]>([newBlock(100)]);
  const [showYaml, setShowYaml] = useState(false);

  // Auto-select first bundle
  useMemo(() => {
    if (!selectedBundleId && bundles.length > 0) setSelectedBundleId(bundles[0].id);
  }, [bundles, selectedBundleId]);

  const yamlPreview = useMemo(
    () => blocksToYaml(blocks, scope, workflowId, tenantId),
    [blocks, scope, workflowId, tenantId],
  );

  // Block CRUD
  const addBlock = () => {
    const maxP = Math.max(...blocks.map((b) => b.priority), 0);
    setBlocks((prev) => [...prev, newBlock(maxP + 10)]);
  };
  const removeBlock = (id: string) => {
    if (blocks.length <= 1) return;
    setBlocks((prev) => prev.filter((b) => b.id !== id));
  };
  const updateBlock = <K extends keyof RuleBlock>(id: string, key: K, value: RuleBlock[K]) => {
    setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, [key]: value } : b)));
  };
  const toggleExpand = (id: string) => {
    setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, expanded: !b.expanded } : b)));
  };

  // Condition CRUD
  const addCondition = (blockId: string) => {
    setBlocks((prev) =>
      prev.map((b) => (b.id === blockId ? { ...b, conditions: [...b.conditions, newCondition()] } : b)),
    );
  };
  const removeCondition = (blockId: string, condId: string) => {
    setBlocks((prev) =>
      prev.map((b) => (b.id === blockId ? { ...b, conditions: b.conditions.filter((c) => c.id !== condId) } : b)),
    );
  };
  const updateCondition = (blockId: string, condId: string, key: keyof Condition, value: string) => {
    setBlocks((prev) =>
      prev.map((b) =>
        b.id === blockId
          ? { ...b, conditions: b.conditions.map((c) => (c.id === condId ? { ...c, [key]: value } : c)) }
          : b,
      ),
    );
  };

  return (
    <PolicyStudioLayout>
      <div className="space-y-6">
        {/* Toolbar */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            {/* Scope selector */}
            <div className="flex items-center gap-1 bg-surface-1 rounded-lg p-0.5 border border-border">
              {SCOPES.map((s) => (
                <button
                  key={s}
                  onClick={() => setScope(s)}
                  className={cn(
                    "px-3 py-1.5 text-xs font-mono rounded-md transition-all",
                    scope === s ? "bg-cordum/15 text-cordum font-medium" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
            {scope === "workflow" && (
              <select
                value={workflowId}
                onChange={(e) => setWorkflowId(e.target.value)}
                className="h-8 px-2 text-xs font-mono bg-surface-1 border border-border rounded-md text-foreground focus:outline-none focus:ring-1 focus:ring-cordum"
              >
                <option value="">Select workflow…</option>
                {workflows.map((w: { id: string; name: string }) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            )}
            {scope === "tenant" && (
              <input
                type="text"
                value={tenantId}
                onChange={(e) => setTenantId(e.target.value)}
                placeholder="tenant-id"
                className="h-8 w-48 px-3 text-xs font-mono bg-surface-1 border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-cordum"
              />
            )}
            <select
              value={selectedBundleId}
              onChange={(e) => setSelectedBundleId(e.target.value)}
              className="h-8 px-2 text-xs font-mono bg-surface-1 border border-border rounded-md text-foreground focus:outline-none focus:ring-1 focus:ring-cordum"
            >
              {bundles.length === 0 && <option value="">No bundles</option>}
              {bundles.map((b) => (
                <option key={b.id} value={b.id}>{b.name} ({b.id})</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowYaml(!showYaml)} className={cn(showYaml && "border-cordum/30 text-cordum")}>
              <Code2 className="w-3 h-3 mr-1" />YAML
            </Button>
            <Button variant="outline" size="sm" onClick={() => toast.info("Simulate — connect to a live Cordum instance")}>
              <Play className="w-3 h-3 mr-1" />Simulate
            </Button>
            <Button variant="primary" size="sm" onClick={() => toast.info("Save — connect to a live Cordum instance to persist")}>
              <Save className="w-3 h-3 mr-1" />Save to Bundle
            </Button>
          </div>
        </div>

        <div className={cn("grid gap-6", showYaml ? "grid-cols-1 lg:grid-cols-2" : "grid-cols-1")}>
          {/* Rule Blocks */}
          <div className="space-y-4">
            {blocks.map((block, bi) => (
              <motion.div
                key={block.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: bi * 0.05 }}
                className={cn("instrument-card overflow-hidden", decisionStatusClass(block.decision))}
              >
                {/* Header */}
                <div className="p-4 border-b border-border flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <GripVertical className="w-4 h-4 text-muted-foreground cursor-grab" />
                    <button onClick={() => toggleExpand(block.id)} className="p-0.5">
                      {block.expanded ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
                    </button>
                    <input
                      type="text"
                      value={block.name}
                      onChange={(e) => updateBlock(block.id, "name", e.target.value)}
                      className="text-sm font-display font-semibold bg-transparent border-none outline-none text-foreground w-48"
                    />
                    <StatusBadge variant={decisionVariant(block.decision)}>{block.decision.replace(/_/g, " ")}</StatusBadge>
                    <span className="text-[10px] font-mono text-muted-foreground">P{block.priority}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={block.priority}
                      onChange={(e) => updateBlock(block.id, "priority", parseInt(e.target.value, 10) || 0)}
                      className="w-16 h-7 px-2 text-xs font-mono bg-surface-1 border border-border rounded-md text-foreground text-center focus:outline-none focus:ring-1 focus:ring-cordum"
                      title="Priority"
                    />
                    {blocks.length > 1 && (
                      <button onClick={() => removeBlock(block.id)} className="p-1.5 rounded hover:bg-red-500/10 transition-colors">
                        <Trash2 className="w-3.5 h-3.5 text-red-400" />
                      </button>
                    )}
                  </div>
                </div>

                <AnimatePresence>
                  {block.expanded && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }}>
                      <div className="p-4 space-y-5">
                        {/* WHERE */}
                        <div>
                          <p className="text-[10px] font-mono text-cordum uppercase tracking-wider mb-3 flex items-center gap-1.5">
                            <Layers className="w-3 h-3" />WHERE (match conditions)
                          </p>
                          <div className="space-y-2">
                            {block.conditions.map((cond, ci) => (
                              <div key={cond.id} className="flex items-center gap-2">
                                {ci > 0 ? (
                                  <span className="text-[10px] font-mono text-cordum w-8 shrink-0">AND</span>
                                ) : (
                                  <span className="text-[10px] font-mono text-muted-foreground w-8 shrink-0">IF</span>
                                )}
                                <select value={cond.field} onChange={(e) => updateCondition(block.id, cond.id, "field", e.target.value)}
                                  className="h-8 px-2 text-xs bg-surface-1 border border-border rounded-md text-foreground focus:outline-none focus:ring-1 focus:ring-cordum">
                                  {MATCH_FIELDS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                                </select>
                                <select value={cond.operator} onChange={(e) => updateCondition(block.id, cond.id, "operator", e.target.value)}
                                  className="h-8 px-2 text-xs bg-surface-1 border border-border rounded-md text-foreground focus:outline-none focus:ring-1 focus:ring-cordum">
                                  {OPERATORS.map((o) => <option key={o} value={o}>{o}</option>)}
                                </select>
                                <input type="text" value={cond.value} onChange={(e) => updateCondition(block.id, cond.id, "value", e.target.value)}
                                  placeholder="value (comma-separated)"
                                  className="h-8 flex-1 px-3 text-xs bg-surface-1 border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-cordum" />
                                {block.conditions.length > 1 && (
                                  <button onClick={() => removeCondition(block.id, cond.id)} className="p-1 rounded hover:bg-red-500/10">
                                    <Trash2 className="w-3 h-3 text-red-400" />
                                  </button>
                                )}
                              </div>
                            ))}
                            <button onClick={() => addCondition(block.id)} className="text-xs text-cordum hover:text-cordum/80 transition-colors flex items-center gap-1">
                              <Plus className="w-3 h-3" />Add Condition
                            </button>
                          </div>
                        </div>

                        {/* THEN */}
                        <div>
                          <p className="text-[10px] font-mono text-amber-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                            <Zap className="w-3 h-3" />THEN (decision)
                          </p>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider block mb-1.5">Decision</label>
                              <select value={block.decision} onChange={(e) => updateBlock(block.id, "decision", e.target.value)}
                                className="h-8 w-full px-2 text-xs bg-surface-1 border border-border rounded-md text-foreground focus:outline-none focus:ring-1 focus:ring-cordum">
                                {DECISIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                              </select>
                            </div>
                            <div>
                              <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider block mb-1.5">Reason</label>
                              <input type="text" value={block.reason} onChange={(e) => updateBlock(block.id, "reason", e.target.value)}
                                placeholder="Human-readable reason"
                                className="h-8 w-full px-3 text-xs bg-surface-1 border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-cordum" />
                            </div>
                          </div>
                        </div>

                        {/* Constraints */}
                        {(block.decision === "allow_with_constraints" || block.decision === "throttle") && (
                          <div>
                            <p className="text-[10px] font-mono text-blue-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                              <Shield className="w-3 h-3" />CONSTRAINTS
                            </p>
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                              <div>
                                <label className="text-[10px] font-mono text-muted-foreground block mb-1">Max Concurrency</label>
                                <input type="number" value={block.maxConcurrency} onChange={(e) => updateBlock(block.id, "maxConcurrency", e.target.value)}
                                  placeholder="5" className="h-8 w-full px-3 text-xs font-mono bg-surface-1 border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-cordum" />
                              </div>
                              <div>
                                <label className="text-[10px] font-mono text-muted-foreground block mb-1">Rate Limit</label>
                                <input type="text" value={block.rateLimit} onChange={(e) => updateBlock(block.id, "rateLimit", e.target.value)}
                                  placeholder="100/min" className="h-8 w-full px-3 text-xs font-mono bg-surface-1 border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-cordum" />
                              </div>
                              <div>
                                <label className="text-[10px] font-mono text-muted-foreground block mb-1">Timeout</label>
                                <input type="text" value={block.timeout} onChange={(e) => updateBlock(block.id, "timeout", e.target.value)}
                                  placeholder="30s" className="h-8 w-full px-3 text-xs font-mono bg-surface-1 border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-cordum" />
                              </div>
                              <div className="flex items-end gap-4">
                                <label className="flex items-center gap-2 cursor-pointer">
                                  <input type="checkbox" checked={block.sandbox} onChange={(e) => updateBlock(block.id, "sandbox", e.target.checked)} className="accent-cordum" />
                                  <span className="text-xs text-foreground">Sandbox</span>
                                </label>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
            <Button variant="outline" size="sm" onClick={addBlock}>
              <Plus className="w-3 h-3 mr-1" />Add Rule Block
            </Button>
          </div>

          {/* YAML Preview */}
          {showYaml && (
            <motion.div initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">YAML Preview</p>
                <button
                  onClick={() => { navigator.clipboard.writeText(yamlPreview); toast.success("Copied"); }}
                  className="p-1.5 rounded hover:bg-surface-2 transition-colors"
                >
                  <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
              </div>
              <div className="instrument-card p-0 overflow-hidden">
                <pre className="p-4 text-xs font-mono text-foreground overflow-auto max-h-[600px] whitespace-pre-wrap">{yamlPreview}</pre>
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </PolicyStudioLayout>
  );
}
