/*
 * DESIGN: "Control Surface" — Policy Builder
 * PRD Section 17: Visual policy builder with YAML preview
 */
import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  Save, Rocket, Plus, Trash2, ArrowLeft, Code, Eye,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Condition {
  id: string;
  field: string;
  operator: string;
  value: string;
}

const FIELDS = ["environment", "agent_id", "action", "pool", "risk_score", "priority", "source_ip"];
const OPERATORS = ["equals", "not_equals", "contains", "starts_with", "greater_than", "less_than", "in", "not_in", "matches"];
const DECISIONS = ["ALLOW", "DENY", "REQUIRE_APPROVAL", "ALLOW_WITH_CONSTRAINTS", "THROTTLE"];

let conditionCounter = 0;

export default function PolicyBuilderPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [actionPattern, setActionPattern] = useState("");
  const [decision, setDecision] = useState("DENY");
  const [priority, setPriority] = useState(100);
  const [conditions, setConditions] = useState<Condition[]>([]);
  const [conditionLogic, setConditionLogic] = useState<"AND" | "OR">("AND");

  const addCondition = () => {
    conditionCounter++;
    setConditions(prev => [...prev, { id: `c-${conditionCounter}`, field: "environment", operator: "equals", value: "" }]);
  };

  const removeCondition = (id: string) => {
    setConditions(prev => prev.filter(c => c.id !== id));
  };

  const updateCondition = (id: string, field: keyof Condition, value: string) => {
    setConditions(prev => prev.map(c => c.id === id ? { ...c, [field]: value } : c));
  };

  const yamlPreview = useMemo(() => {
    let yaml = `name: ${name || "<rule-name>"}\n`;
    yaml += `description: "${description || ""}"\n`;
    yaml += `action: "${actionPattern || "*"}"\n`;
    yaml += `decision: ${decision}\n`;
    yaml += `priority: ${priority}\n`;
    if (conditions.length > 0) {
      yaml += `conditions:\n`;
      yaml += `  logic: ${conditionLogic}\n`;
      yaml += `  rules:\n`;
      conditions.forEach(c => {
        yaml += `    - field: ${c.field}\n`;
        yaml += `      op: ${c.operator}\n`;
        yaml += `      value: "${c.value}"\n`;
      });
    }
    return yaml;
  }, [name, description, actionPattern, decision, priority, conditions, conditionLogic]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate("/policies/rules")} className="p-2 rounded-md hover:bg-surface-2 transition-colors">
          <ArrowLeft className="w-4 h-4 text-muted-foreground" />
        </button>
        <PageHeader label="Govern" title="Policy Builder" subtitle="Build policy rules visually" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Visual Builder — 2/3 */}
        <div className="lg:col-span-2 space-y-4">
          <div className="instrument-card p-5 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider block mb-1.5">Rule Name</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., block-prod-writes" className="h-8 w-full px-3 text-xs bg-surface-1 border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-cordum" />
              </div>
              <div>
                <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider block mb-1.5">Action Pattern</label>
                <input type="text" value={actionPattern} onChange={(e) => setActionPattern(e.target.value)} placeholder="e.g., service.*" className="h-8 w-full px-3 text-xs font-mono bg-surface-1 border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-cordum" />
              </div>
            </div>
            <div>
              <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider block mb-1.5">Description</label>
              <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Human-readable description..." className="w-full px-3 py-2 text-xs bg-surface-1 border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-cordum resize-none" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider block mb-1.5">Decision</label>
                <select value={decision} onChange={(e) => setDecision(e.target.value)} className="h-8 w-full px-3 text-xs bg-surface-1 border border-border rounded-md text-foreground focus:outline-none focus:ring-1 focus:ring-cordum">
                  {DECISIONS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider block mb-1.5">Priority</label>
                <input type="number" value={priority} onChange={(e) => setPriority(Number(e.target.value))} min={1} max={1000} className="h-8 w-full px-3 text-xs bg-surface-1 border border-border rounded-md text-foreground focus:outline-none focus:ring-1 focus:ring-cordum" />
              </div>
            </div>
          </div>

          {/* Conditions */}
          <div className="instrument-card p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <h3 className="font-display font-semibold text-sm text-foreground">WHEN</h3>
                <div className="flex items-center gap-1 bg-surface-1 border border-border rounded-md p-0.5">
                  {(["AND", "OR"] as const).map(l => (
                    <button key={l} onClick={() => setConditionLogic(l)} className={cn("px-2 py-0.5 text-[10px] font-mono rounded transition-colors", conditionLogic === l ? "bg-cordum/10 text-cordum" : "text-muted-foreground")}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={addCondition}><Plus className="w-3 h-3 mr-1" />Add Condition</Button>
            </div>
            {conditions.length === 0 ? (
              <p className="text-xs text-muted-foreground italic py-4 text-center">No conditions — rule will match all jobs matching the action pattern</p>
            ) : (
              <div className="space-y-2">
                {conditions.map((c, i) => (
                  <div key={c.id} className="flex items-center gap-2">
                    {i > 0 && <span className="text-[10px] font-mono text-cordum w-8 text-center">{conditionLogic}</span>}
                    {i === 0 && <span className="w-8" />}
                    <select value={c.field} onChange={(e) => updateCondition(c.id, "field", e.target.value)} className="h-7 px-2 text-xs bg-surface-1 border border-border rounded text-foreground focus:outline-none focus:ring-1 focus:ring-cordum">
                      {FIELDS.map(f => <option key={f}>{f}</option>)}
                    </select>
                    <select value={c.operator} onChange={(e) => updateCondition(c.id, "operator", e.target.value)} className="h-7 px-2 text-xs bg-surface-1 border border-border rounded text-foreground focus:outline-none focus:ring-1 focus:ring-cordum">
                      {OPERATORS.map(o => <option key={o}>{o}</option>)}
                    </select>
                    <input type="text" value={c.value} onChange={(e) => updateCondition(c.id, "value", e.target.value)} placeholder="value" className="h-7 flex-1 px-2 text-xs bg-surface-1 border border-border rounded text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-cordum" />
                    <button onClick={() => removeCondition(c.id)} className="p-1 rounded hover:bg-surface-2 text-muted-foreground hover:text-red-400 transition-colors">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => toast.success("Draft saved")}><Save className="w-3 h-3 mr-1" />Save Draft</Button>
            <Button variant="primary" size="sm" onClick={() => { toast.success("Policy deployed"); navigate("/policies/rules"); }}><Rocket className="w-3 h-3 mr-1" />Deploy</Button>
          </div>
        </div>

        {/* YAML Preview — 1/3 */}
        <div className="instrument-card p-5 h-fit sticky top-6">
          <div className="flex items-center gap-2 mb-4">
            <Code className="w-4 h-4 text-cordum" />
            <h3 className="font-display font-semibold text-sm text-foreground">YAML Preview</h3>
          </div>
          <div className="rounded-md bg-surface-0 border border-border p-4 font-mono text-xs text-foreground overflow-auto max-h-[500px]">
            <pre className="whitespace-pre-wrap">{yamlPreview}</pre>
          </div>
          <Button variant="ghost" size="sm" className="mt-3 w-full" onClick={() => { navigator.clipboard.writeText(yamlPreview); toast.success("YAML copied"); }}>
            Copy YAML
          </Button>
        </div>
      </div>
    </div>
  );
}
