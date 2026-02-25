/*
 * DESIGN: "Control Surface" — Policy Builder
 * PRD Section 17: Visual rule builder with conditions
 */
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { post } from "@/api/client";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ArrowLeft, Save, Plus, Trash2, GripVertical, Shield, AlertTriangle, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Condition {
  id: string;
  field: string;
  operator: string;
  value: string;
}

interface RuleBlock {
  id: string;
  name: string;
  action: "allow" | "deny" | "warn";
  conditions: Condition[];
}

let counter = 0;

export default function PoliciesBuilderPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = !!id;

  const [ruleName, setRuleName] = useState(isEdit ? "production-safety" : "");
  const [description, setDescription] = useState("");
  const [blocks, setBlocks] = useState<RuleBlock[]>([
    {
      id: "block-1",
      name: "Default Block",
      action: "allow",
      conditions: [{ id: "cond-1", field: "topic", operator: "equals", value: "" }],
    },
  ]);

  const FIELDS = ["topic", "payload.size", "agent.role", "agent.name", "risk_score", "source_ip"];
  const OPERATORS = ["equals", "not_equals", "contains", "greater_than", "less_than", "matches"];
  const ACTIONS = ["allow", "deny", "warn"];

  const addBlock = () => {
    counter++;
    setBlocks(prev => [...prev, {
      id: `block-${counter}`,
      name: `Rule ${prev.length + 1}`,
      action: "deny",
      conditions: [{ id: `cond-${counter}`, field: "topic", operator: "equals", value: "" }],
    }]);
  };

  const removeBlock = (blockId: string) => {
    setBlocks(prev => prev.filter(b => b.id !== blockId));
  };

  const addCondition = (blockId: string) => {
    counter++;
    setBlocks(prev => prev.map(b =>
      b.id === blockId ? { ...b, conditions: [...b.conditions, { id: `cond-${counter}`, field: "topic", operator: "equals", value: "" }] } : b
    ));
  };

  const removeCondition = (blockId: string, condId: string) => {
    setBlocks(prev => prev.map(b =>
      b.id === blockId ? { ...b, conditions: b.conditions.filter(c => c.id !== condId) } : b
    ));
  };

  const updateCondition = (blockId: string, condId: string, field: string, value: string) => {
    setBlocks(prev => prev.map(b =>
      b.id === blockId ? { ...b, conditions: b.conditions.map(c => c.id === condId ? { ...c, [field]: value } : c) } : b
    ));
  };

  const updateBlock = (blockId: string, field: string, value: string) => {
    setBlocks(prev => prev.map(b => b.id === blockId ? { ...b, [field]: value } : b));
  };

  const saveMutation = useMutation({
    mutationFn: async () => post("/api/policies/rules", { name: ruleName, description, blocks }),
    onSuccess: () => { toast.success("Policy rule saved"); navigate("/policies/rules"); },
  });

  const actionColor = (a: string) => a === "allow" ? "healthy" : a === "deny" ? "danger" : "warning";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/policies/rules")} className="p-1.5 rounded-md hover:bg-surface-2 transition-colors">
            <ArrowLeft className="w-4 h-4 text-muted-foreground" />
          </button>
          <div>
            <h1 className="text-lg font-display font-bold text-foreground">{isEdit ? "Edit Rule" : "Create Rule"}</h1>
            <p className="text-xs text-muted-foreground">Define conditions and actions for policy enforcement</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate("/policies/rules")}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={() => saveMutation.mutate()} loading={saveMutation.isPending}>
            <Save className="w-3 h-3 mr-1" />Save Rule
          </Button>
        </div>
      </div>

      {/* Rule Meta */}
      <div className="instrument-card p-5 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider block mb-1.5">Rule Name</label>
            <input type="text" value={ruleName} onChange={(e) => setRuleName(e.target.value)} placeholder="e.g., block-dangerous-topics"
              className="h-8 w-full px-3 text-xs bg-surface-1 border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-cordum" />
          </div>
          <div>
            <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider block mb-1.5">Description</label>
            <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does this rule do?"
              className="h-8 w-full px-3 text-xs bg-surface-1 border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-cordum" />
          </div>
        </div>
      </div>

      {/* Rule Blocks */}
      <div className="space-y-4">
        {blocks.map((block, bi) => (
          <motion.div key={block.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            className={cn("instrument-card overflow-hidden", `status-${actionColor(block.action) === "healthy" ? "healthy" : actionColor(block.action) === "danger" ? "danger" : "warning"}`)}>
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-3">
                <GripVertical className="w-4 h-4 text-muted-foreground cursor-grab" />
                <input type="text" value={block.name} onChange={(e) => updateBlock(block.id, "name", e.target.value)}
                  className="text-sm font-display font-semibold bg-transparent border-none outline-none text-foreground w-48" />
                <select value={block.action} onChange={(e) => updateBlock(block.id, "action", e.target.value)}
                  className="h-7 px-2 text-xs bg-surface-1 border border-border rounded-md text-foreground focus:outline-none focus:ring-1 focus:ring-cordum">
                  {ACTIONS.map(a => <option key={a} value={a}>{a.toUpperCase()}</option>)}
                </select>
              </div>
              {blocks.length > 1 && (
                <button onClick={() => removeBlock(block.id)} className="p-1.5 rounded hover:bg-red-500/10 transition-colors">
                  <Trash2 className="w-3.5 h-3.5 text-red-400" />
                </button>
              )}
            </div>
            <div className="p-4 space-y-3">
              <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Conditions (all must match)</p>
              {block.conditions.map((cond, ci) => (
                <div key={cond.id} className="flex items-center gap-2">
                  {ci > 0 && <span className="text-[10px] font-mono text-cordum w-8">AND</span>}
                  {ci === 0 && <span className="text-[10px] font-mono text-muted-foreground w-8">IF</span>}
                  <select value={cond.field} onChange={(e) => updateCondition(block.id, cond.id, "field", e.target.value)}
                    className="h-8 px-2 text-xs bg-surface-1 border border-border rounded-md text-foreground focus:outline-none focus:ring-1 focus:ring-cordum">
                    {FIELDS.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                  <select value={cond.operator} onChange={(e) => updateCondition(block.id, cond.id, "operator", e.target.value)}
                    className="h-8 px-2 text-xs bg-surface-1 border border-border rounded-md text-foreground focus:outline-none focus:ring-1 focus:ring-cordum">
                    {OPERATORS.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                  <input type="text" value={cond.value} onChange={(e) => updateCondition(block.id, cond.id, "value", e.target.value)}
                    placeholder="value" className="h-8 flex-1 px-3 text-xs bg-surface-1 border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-cordum" />
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
          </motion.div>
        ))}
        <Button variant="outline" size="sm" onClick={addBlock}>
          <Plus className="w-3 h-3 mr-1" />Add Rule Block
        </Button>
      </div>
    </div>
  );
}
