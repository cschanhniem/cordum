/*
 * DESIGN: "Control Surface" — Workflow Builder
 * PRD Section 12: Visual drag-and-drop workflow builder
 */
import { useState, useCallback, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  ArrowLeft, Save, Rocket, X, Plus, Briefcase, Shield, GitBranch,
  Clock, Repeat, Layers, Workflow, GripVertical, ChevronRight,
  AlertTriangle, Settings, Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type NodeType = "worker" | "approval" | "condition" | "delay" | "loop" | "parallel" | "subworkflow";

interface BuilderNode {
  id: string;
  type: NodeType;
  label: string;
  x: number;
  y: number;
  config: Record<string, any>;
}

interface BuilderEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

const NODE_TYPES: { type: NodeType; label: string; icon: any; color: string; desc: string }[] = [
  { type: "worker", label: "Worker", icon: Briefcase, color: "text-cordum border-cordum/30", desc: "Execute a job" },
  { type: "approval", label: "Approval", icon: Shield, color: "text-amber-400 border-amber-400/30", desc: "Human gate" },
  { type: "condition", label: "Condition", icon: GitBranch, color: "text-blue-400 border-blue-400/30", desc: "Branch logic" },
  { type: "delay", label: "Delay", icon: Clock, color: "text-gray-400 border-gray-400/30", desc: "Wait duration" },
  { type: "loop", label: "Loop", icon: Repeat, color: "text-blue-400 border-blue-400/30", desc: "Iterate items" },
  { type: "parallel", label: "Parallel", icon: Layers, color: "text-cordum border-cordum/30", desc: "Concurrent" },
  { type: "subworkflow", label: "Subworkflow", icon: Workflow, color: "text-gray-400 border-gray-400/30", desc: "Nested flow" },
];

let nodeCounter = 0;

export default function WorkflowBuilderPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = !!id;

  const [workflowName, setWorkflowName] = useState(isEdit ? "production-safety" : "");
  const [nodes, setNodes] = useState<BuilderNode[]>([]);
  const [edges, setEdges] = useState<BuilderEdge[]>([]);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  const addNode = useCallback((type: NodeType) => {
    nodeCounter++;
    const newNode: BuilderNode = {
      id: `node-${nodeCounter}`,
      type,
      label: `${type.charAt(0).toUpperCase() + type.slice(1)} ${nodeCounter}`,
      x: 200 + (nodeCounter % 4) * 180,
      y: 100 + Math.floor(nodeCounter / 4) * 120,
      config: {},
    };
    setNodes(prev => [...prev, newNode]);
    setSelectedNode(newNode.id);
  }, []);

  const removeNode = useCallback((nodeId: string) => {
    setNodes(prev => prev.filter(n => n.id !== nodeId));
    setEdges(prev => prev.filter(e => e.source !== nodeId && e.target !== nodeId));
    if (selectedNode === nodeId) setSelectedNode(null);
  }, [selectedNode]);

  const updateNodeLabel = useCallback((nodeId: string, label: string) => {
    setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, label } : n));
  }, []);

  const selectedNodeData = nodes.find(n => n.id === selectedNode);
  const nodeTypeInfo = selectedNodeData ? NODE_TYPES.find(t => t.type === selectedNodeData.type) : null;

  const handleDeploy = () => {
    if (!workflowName.trim()) {
      toast.error("Workflow name is required");
      return;
    }
    if (nodes.length === 0) {
      toast.error("Add at least one node to the workflow");
      return;
    }
    toast.success("Workflow deployed successfully");
    navigate("/workflows");
  };

  return (
    <div className="h-[calc(100vh-64px)] flex flex-col -m-6">
      {/* Top Bar */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-surface-0 shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/workflows")} className="p-1.5 rounded-md hover:bg-surface-2 transition-colors">
            <ArrowLeft className="w-4 h-4 text-muted-foreground" />
          </button>
          <input
            type="text"
            value={workflowName}
            onChange={(e) => setWorkflowName(e.target.value)}
            placeholder="Workflow name..."
            className="text-sm font-display font-semibold bg-transparent border-none outline-none text-foreground placeholder:text-muted-foreground w-64"
          />
          <StatusBadge variant="info">Draft</StatusBadge>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate("/workflows")}>Cancel</Button>
          <Button variant="outline" size="sm"><Save className="w-3 h-3 mr-1" />Save Draft</Button>
          <Button variant="primary" size="sm" onClick={handleDeploy}><Rocket className="w-3 h-3 mr-1" />Deploy</Button>
        </div>
      </div>

      {/* 3-Panel Layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar — Node Types */}
        <div className="w-60 border-r border-border bg-surface-0 overflow-y-auto shrink-0">
          <div className="p-4">
            <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-3">Node Types</p>
            <div className="space-y-1.5">
              {NODE_TYPES.map((nt) => {
                const Icon = nt.icon;
                return (
                  <button
                    key={nt.type}
                    onClick={() => addNode(nt.type)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-surface-1 transition-colors text-left group"
                  >
                    <div className={cn("w-8 h-8 rounded-lg border flex items-center justify-center", nt.color)}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground">{nt.label}</p>
                      <p className="text-[10px] text-muted-foreground">{nt.desc}</p>
                    </div>
                    <Plus className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                );
              })}
            </div>
          </div>
          <div className="border-t border-border p-4">
            <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-3">Packs</p>
            <div className="space-y-1">
              {["slack.send", "github.create-pr", "jira.create-issue", "email.send"].map((pack) => (
                <button
                  key={pack}
                  onClick={() => {
                    addNode("worker");
                    toast.info(`Added worker node with topic: job.${pack}`);
                  }}
                  className="w-full text-left px-3 py-2 rounded-md hover:bg-surface-1 transition-colors"
                >
                  <span className="text-xs font-mono text-cordum">job.{pack}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Canvas */}
        <div
          ref={canvasRef}
          className="flex-1 relative overflow-auto"
          style={{ backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.05) 1px, transparent 1px)", backgroundSize: "20px 20px" }}
          onClick={() => setSelectedNode(null)}
        >
          {nodes.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <Workflow className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">Drag nodes from the sidebar or click to add</p>
                <p className="text-xs text-muted-foreground/60 mt-1">Connect nodes to build your workflow</p>
              </div>
            </div>
          )}

          {/* Render edges as SVG lines */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none">
            {edges.map((edge) => {
              const src = nodes.find(n => n.id === edge.source);
              const tgt = nodes.find(n => n.id === edge.target);
              if (!src || !tgt) return null;
              return (
                <line
                  key={edge.id}
                  x1={src.x + 80} y1={src.y + 30}
                  x2={tgt.x + 80} y2={tgt.y + 30}
                  stroke="rgba(0,229,160,0.3)"
                  strokeWidth={2}
                  strokeDasharray="6 4"
                />
              );
            })}
          </svg>

          {/* Render nodes */}
          {nodes.map((node) => {
            const nt = NODE_TYPES.find(t => t.type === node.type)!;
            const Icon = nt.icon;
            const isSelected = selectedNode === node.id;
            return (
              <motion.div
                key={node.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                style={{ position: "absolute", left: node.x, top: node.y }}
                onClick={(e) => { e.stopPropagation(); setSelectedNode(node.id); }}
                className={cn(
                  "w-40 rounded-lg border bg-surface-1 shadow-lg cursor-pointer transition-all",
                  isSelected ? "ring-2 ring-cordum border-cordum/40" : "border-border hover:border-cordum/20",
                )}
              >
                <div className={cn("h-1 rounded-t-lg", nt.color.includes("cordum") ? "bg-cordum" : nt.color.includes("amber") ? "bg-amber-400" : nt.color.includes("blue") ? "bg-blue-400" : "bg-gray-400")} />
                <div className="p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className={cn("w-3.5 h-3.5", nt.color.split(" ")[0])} />
                    <span className="text-xs font-medium text-foreground truncate">{node.label}</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground">{nt.desc}</p>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Right Panel — Node Config */}
        {selectedNodeData && nodeTypeInfo && (
          <motion.div
            initial={{ x: 320 }}
            animate={{ x: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="w-80 border-l border-border bg-surface-0 overflow-y-auto shrink-0"
          >
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <nodeTypeInfo.icon className={cn("w-4 h-4", nodeTypeInfo.color.split(" ")[0])} />
                <span className="text-sm font-display font-semibold text-foreground">{nodeTypeInfo.label} Config</span>
              </div>
              <button onClick={() => setSelectedNode(null)} className="p-1 rounded hover:bg-surface-2 transition-colors">
                <X className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider block mb-1.5">Label</label>
                <input
                  type="text"
                  value={selectedNodeData.label}
                  onChange={(e) => updateNodeLabel(selectedNodeData.id, e.target.value)}
                  className="h-8 w-full px-3 text-xs bg-surface-1 border border-border rounded-md text-foreground focus:outline-none focus:ring-1 focus:ring-cordum"
                />
              </div>

              {selectedNodeData.type === "worker" && (
                <>
                  <div>
                    <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider block mb-1.5">Topic</label>
                    <input type="text" placeholder="e.g., service.restart" className="h-8 w-full px-3 text-xs bg-surface-1 border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-cordum" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider block mb-1.5">Timeout</label>
                      <input type="number" defaultValue={30} className="h-8 w-full px-3 text-xs bg-surface-1 border border-border rounded-md text-foreground focus:outline-none focus:ring-1 focus:ring-cordum" />
                    </div>
                    <div>
                      <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider block mb-1.5">Retries</label>
                      <input type="number" defaultValue={0} min={0} max={5} className="h-8 w-full px-3 text-xs bg-surface-1 border border-border rounded-md text-foreground focus:outline-none focus:ring-1 focus:ring-cordum" />
                    </div>
                  </div>
                </>
              )}

              {selectedNodeData.type === "approval" && (
                <>
                  <div>
                    <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider block mb-1.5">Approvers</label>
                    <input type="text" placeholder="admin, ops-team" className="h-8 w-full px-3 text-xs bg-surface-1 border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-cordum" />
                  </div>
                  <div>
                    <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider block mb-1.5">Message</label>
                    <textarea rows={3} placeholder="Message shown to approver..." className="w-full px-3 py-2 text-xs bg-surface-1 border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-cordum resize-none" />
                  </div>
                </>
              )}

              {selectedNodeData.type === "condition" && (
                <div>
                  <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider block mb-1.5">Expression</label>
                  <textarea rows={3} placeholder="ctx.risk_score > 0.8" className="w-full px-3 py-2 text-xs font-mono bg-surface-1 border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-cordum resize-none" />
                </div>
              )}

              {selectedNodeData.type === "delay" && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider block mb-1.5">Duration</label>
                    <input type="number" defaultValue={60} className="h-8 w-full px-3 text-xs bg-surface-1 border border-border rounded-md text-foreground focus:outline-none focus:ring-1 focus:ring-cordum" />
                  </div>
                  <div>
                    <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider block mb-1.5">Unit</label>
                    <select className="h-8 w-full px-3 text-xs bg-surface-1 border border-border rounded-md text-foreground focus:outline-none focus:ring-1 focus:ring-cordum">
                      <option>seconds</option><option>minutes</option><option>hours</option>
                    </select>
                  </div>
                </div>
              )}

              {selectedNodeData.type === "loop" && (
                <>
                  <div>
                    <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider block mb-1.5">Items Expression</label>
                    <textarea rows={2} placeholder="ctx.items" className="w-full px-3 py-2 text-xs font-mono bg-surface-1 border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-cordum resize-none" />
                  </div>
                  <div>
                    <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider block mb-1.5">Max Iterations</label>
                    <input type="number" defaultValue={100} className="h-8 w-full px-3 text-xs bg-surface-1 border border-border rounded-md text-foreground focus:outline-none focus:ring-1 focus:ring-cordum" />
                  </div>
                </>
              )}

              {selectedNodeData.type === "parallel" && (
                <>
                  <div>
                    <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider block mb-1.5">Branches</label>
                    <input type="number" defaultValue={2} min={2} max={10} className="h-8 w-full px-3 text-xs bg-surface-1 border border-border rounded-md text-foreground focus:outline-none focus:ring-1 focus:ring-cordum" />
                  </div>
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-foreground">Wait for all</label>
                    <div className="w-9 h-5 rounded-full bg-cordum/20 relative cursor-pointer">
                      <div className="absolute left-0.5 top-0.5 w-4 h-4 rounded-full bg-cordum transition-transform" />
                    </div>
                  </div>
                </>
              )}

              {selectedNodeData.type === "subworkflow" && (
                <div>
                  <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider block mb-1.5">Workflow</label>
                  <select className="h-8 w-full px-3 text-xs bg-surface-1 border border-border rounded-md text-foreground focus:outline-none focus:ring-1 focus:ring-cordum">
                    <option value="">Select workflow...</option>
                    <option>production-safety</option>
                    <option>data-pipeline</option>
                  </select>
                </div>
              )}

              <div className="pt-3 border-t border-border">
                <Button variant="danger" size="sm" className="w-full" onClick={() => removeNode(selectedNodeData.id)}>
                  <Trash2 className="w-3 h-3 mr-1" />
                  Remove Node
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
