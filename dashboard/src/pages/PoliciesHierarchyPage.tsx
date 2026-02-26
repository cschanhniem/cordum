/*
 * DESIGN: "Control Surface" — Policy Hierarchy v2
 * Spec: Tree visualization of System → Tenant → Workflow → Step → Job
 * Shows how policies layer and which scope wins at each level.
 */
import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { PolicyStudioLayout } from "@/components/layout/PolicyStudioLayout";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  ChevronRight, ChevronDown, Globe, Building2, GitBranch,
  Layers, Briefcase, Shield, Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { usePolicyBundles, usePolicyRules } from "@/hooks/usePolicies";
import { useWorkflows } from "@/hooks/useWorkflows";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface TreeNode {
  id: string;
  label: string;
  scope: string;
  icon: React.ReactNode;
  ruleCount: number;
  bundleCount: number;
  decision?: string;
  children: TreeNode[];
}

function decisionVariant(d?: string) {
  switch (d) {
    case "allow": return "healthy" as const;
    case "deny": return "danger" as const;
    case "require_approval": return "warning" as const;
    case "allow_with_constraints": return "info" as const;
    default: return "muted" as const;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function PoliciesHierarchyPage() {
  const { data: bundlesData } = usePolicyBundles();
  const { data: rulesData } = usePolicyRules();
  const { data: workflowsData } = useWorkflows();

  const bundles = bundlesData?.items ?? [];
  const rules = rulesData?.items ?? [];
  const workflows = workflowsData ?? [];

  // Build hierarchy tree from data
  const tree = useMemo<TreeNode>(() => {
    const globalRules = rules.filter(
      (r) => !r.match?.tenants?.length && !r.match?.topics?.length,
    );
    const tenantIds = [...new Set(rules.flatMap((r) => r.match?.tenants ?? []))];
    // Infer workflow-scoped rules by matching topics that look like workflow IDs
    const workflowTopics = [...new Set(rules.flatMap((r) => r.match?.topics ?? []))];
    const workflowIds = workflowTopics.filter((t) => workflows.some((w: { id: string }) => w.id === t));

    const tenantNodes: TreeNode[] = tenantIds.map((tid) => {
      const tRules = rules.filter((r) => r.match?.tenants?.includes(tid));
      return {
        id: `tenant-${tid}`,
        label: tid,
        scope: "tenant",
        icon: <Building2 className="w-3.5 h-3.5" />,
        ruleCount: tRules.length,
        bundleCount: [...new Set(tRules.map((r) => r.bundle_id))].length,
        children: [],
      };
    });

    const workflowNodes: TreeNode[] = workflowIds.map((wid) => {
      const wf = workflows.find((w: { id: string; name: string }) => w.id === wid);
      const wRules = rules.filter((r) => r.match?.topics?.includes(wid));
      return {
        id: `workflow-${wid}`,
        label: wf?.name ?? wid,
        scope: "workflow",
        icon: <GitBranch className="w-3.5 h-3.5" />,
        ruleCount: wRules.length,
        bundleCount: [...new Set(wRules.map((r) => r.bundle_id))].length,
        children: [
          // Step-level placeholder
          {
            id: `step-${wid}-worker`,
            label: "Worker Steps",
            scope: "step",
            icon: <Layers className="w-3.5 h-3.5" />,
            ruleCount: 0,
            bundleCount: 0,
            children: [],
          },
        ],
      };
    });

    return {
      id: "system",
      label: "System (Global)",
      scope: "system",
      icon: <Globe className="w-3.5 h-3.5" />,
      ruleCount: globalRules.length,
      bundleCount: bundles.length,
      children: [
        ...tenantNodes,
        ...workflowNodes,
        {
          id: "job-level",
          label: "Job-Level Overrides",
          scope: "job",
          icon: <Briefcase className="w-3.5 h-3.5" />,
          ruleCount: 0,
          bundleCount: 0,
          children: [],
        },
      ],
    };
  }, [rules, bundles, workflows]);

  return (
    <PolicyStudioLayout>
      <div className="space-y-6">
        {/* Info banner */}
        <div className="instrument-card p-4 status-info flex items-start gap-3">
          <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-foreground">Policy Evaluation Order</p>
            <p className="text-xs text-muted-foreground mt-1">
              Policies are evaluated from most specific to least specific:
              <span className="font-mono text-foreground"> Job → Step → Workflow → Tenant → System</span>.
              The first matching rule with the highest priority at the most specific scope wins.
            </p>
          </div>
        </div>

        {/* Tree */}
        <div className="instrument-card p-0 overflow-hidden">
          <div className="px-4 py-3 bg-surface-0 border-b border-border flex items-center justify-between">
            <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Scope Hierarchy</p>
            <div className="flex items-center gap-4 text-[10px] font-mono text-muted-foreground">
              <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-emerald-400" /> Allow</span>
              <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-red-400" /> Deny</span>
              <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-amber-400" /> Approval</span>
              <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-blue-400" /> Constrained</span>
            </div>
          </div>
          <div className="p-4">
            <TreeNodeRow node={tree} depth={0} />
          </div>
        </div>

        {/* Legend */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <LegendCard
            icon={<Globe className="w-4 h-4 text-cordum" />}
            title="System / Global"
            description="Default rules that apply to all jobs unless overridden by a more specific scope."
          />
          <LegendCard
            icon={<Building2 className="w-4 h-4 text-amber-400" />}
            title="Tenant"
            description="Rules scoped to a specific tenant. Override global rules for that tenant's jobs."
          />
          <LegendCard
            icon={<GitBranch className="w-4 h-4 text-blue-400" />}
            title="Workflow / Step"
            description="Rules bound to a specific workflow or step. Most specific scope before job-level."
          />
        </div>
      </div>
    </PolicyStudioLayout>
  );
}

// ---------------------------------------------------------------------------
// Tree Node Row
// ---------------------------------------------------------------------------
function TreeNodeRow({ node, depth }: { node: TreeNode; depth: number }) {
  const [expanded, setExpanded] = useState(depth < 2);
  const hasChildren = node.children.length > 0;

  return (
    <div>
      <button
        onClick={() => hasChildren && setExpanded(!expanded)}
        className={cn(
          "w-full flex items-center gap-3 py-2.5 px-3 rounded-lg transition-colors text-left group",
          hasChildren ? "hover:bg-surface-1 cursor-pointer" : "cursor-default",
        )}
        style={{ paddingLeft: `${depth * 24 + 12}px` }}
      >
        {/* Expand icon */}
        <div className="w-4 h-4 flex items-center justify-center shrink-0">
          {hasChildren ? (
            expanded ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
          ) : (
            <div className="w-1.5 h-1.5 rounded-full bg-border" />
          )}
        </div>

        {/* Icon */}
        <div className={cn(
          "w-7 h-7 rounded-lg flex items-center justify-center shrink-0",
          node.scope === "system" ? "bg-cordum/15 text-cordum" :
          node.scope === "tenant" ? "bg-amber-400/15 text-amber-400" :
          node.scope === "workflow" ? "bg-blue-400/15 text-blue-400" :
          node.scope === "step" ? "bg-purple-400/15 text-purple-400" :
          "bg-muted/30 text-muted-foreground",
        )}>
          {node.icon}
        </div>

        {/* Label */}
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium text-foreground">{node.label}</span>
          <span className="text-[10px] font-mono text-muted-foreground ml-2">{node.scope}</span>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-3 shrink-0">
          {node.ruleCount > 0 && (
            <span className="text-[10px] font-mono text-muted-foreground">
              {node.ruleCount} rule{node.ruleCount !== 1 ? "s" : ""}
            </span>
          )}
          {node.bundleCount > 0 && (
            <span className="text-[10px] font-mono text-muted-foreground">
              {node.bundleCount} bundle{node.bundleCount !== 1 ? "s" : ""}
            </span>
          )}
          {node.decision && (
            <StatusBadge variant={decisionVariant(node.decision)}>
              {node.decision.replace(/_/g, " ")}
            </StatusBadge>
          )}
        </div>
      </button>

      <AnimatePresence>
        {expanded && hasChildren && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {node.children.map((child) => (
              <TreeNodeRow key={child.id} node={child} depth={depth + 1} />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Legend Card
// ---------------------------------------------------------------------------
function LegendCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="instrument-card p-4">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-sm font-display font-semibold text-foreground">{title}</span>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
    </div>
  );
}
