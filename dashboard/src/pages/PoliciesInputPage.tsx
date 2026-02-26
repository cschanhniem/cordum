/*
 * PoliciesInputPage — Input Policy page with scope sub-tabs.
 * Sub-tabs: Global, Workflow-Scoped, Tenant.
 * Uses PolicyStudioLayout for primary tabs.
 */
import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { Plus, Search, Shield, GitBranch } from "lucide-react";
import { cn } from "@/lib/utils";
import { PolicyStudioLayout } from "@/components/layout/PolicyStudioLayout";
import { ScopeTabs } from "@/components/policy/ScopeTabs";
import { InputRuleCard } from "@/components/policy/InputRuleCard";
import { InputRuleEditor } from "@/components/policy/InputRuleEditor";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonCard } from "@/components/ui/Skeleton";
import { usePolicyRules, usePolicyBundles } from "@/hooks/usePolicies";
import { useWorkflows } from "@/hooks/useWorkflows";
import { toast } from "sonner";
import type { PolicyRule, PolicyBundle } from "@/api/types";

type ScopeTab = "global" | "workflow" | "tenant";
type Decision = "all" | "allow" | "deny" | "require_approval" | "allow_with_constraints" | "throttle";

// Scope detection: rules with match.tenants are tenant-scoped,
// rules with match.topics containing workflow-like patterns or bundle_id matching a workflow are workflow-scoped,
// everything else is global.
function getGlobalRules(rules: PolicyRule[]): PolicyRule[] {
  return rules.filter((r) => !r.match?.tenants?.length);
}

function getTenantRules(rules: PolicyRule[]): PolicyRule[] {
  return rules.filter((r) => (r.match?.tenants?.length ?? 0) > 0);
}

export default function PoliciesInputPage() {
  const [activeScope, setActiveScope] = useState<ScopeTab>("global");
  const [search, setSearch] = useState("");
  const [decisionFilter, setDecisionFilter] = useState<Decision>("all");
  const [bundleFilter, setBundleFilter] = useState("all");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<PolicyRule | null>(null);
  const [selectedWorkflow, setSelectedWorkflow] = useState<string | null>(null);
  const [showInherited, setShowInherited] = useState(true);

  const { data: rulesData, isLoading: rulesLoading } = usePolicyRules();
  const { data: bundlesData } = usePolicyBundles();
  const { data: workflows } = useWorkflows();

  const allRules = useMemo(() => rulesData?.items ?? [], [rulesData]);
  const bundles = useMemo(() => bundlesData?.items ?? [], [bundlesData]);

  const globalRules = useMemo(() => getGlobalRules(allRules), [allRules]);
  const workflowsWithRules = useMemo(() => {
    const wfMap = new Map<string, PolicyRule[]>();
    // Group rules by bundle_id matching workflow IDs
    const wfIds = new Set((workflows ?? []).map((w) => w.id));
    allRules.forEach((r) => {
      if (r.bundle_id && wfIds.has(r.bundle_id)) {
        const existing = wfMap.get(r.bundle_id) ?? [];
        existing.push(r);
        wfMap.set(r.bundle_id, existing);
      }
    });
    return wfMap;
  }, [allRules, workflows]);
  const tenantRules = useMemo(() => getTenantRules(allRules), [allRules]);

  // Scope tab counts
  const scopeTabs = useMemo(() => [
    { id: "global", label: "Global", count: globalRules.length },
    { id: "workflow", label: "Workflow-Scoped", count: workflowsWithRules.size },
    { id: "tenant", label: "Tenant", count: tenantRules.length > 0 ? 1 : 0 },
  ], [globalRules, workflowsWithRules, tenantRules]);

  // Filtered global rules
  const filteredGlobalRules = useMemo(() => {
    let filtered = globalRules;
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter((r) =>
        r.name?.toLowerCase().includes(q) ||
        r.match?.topics?.some((t) => t.toLowerCase().includes(q)) ||
        r.decision?.toLowerCase().includes(q)
      );
    }
    if (decisionFilter !== "all") {
      filtered = filtered.filter((r) => r.decision?.toLowerCase() === decisionFilter);
    }
    if (bundleFilter !== "all") {
      filtered = filtered.filter((r) => r.bundle_id === bundleFilter);
    }
    return filtered;
  }, [globalRules, search, decisionFilter, bundleFilter]);

  const handleNewRule = () => {
    setEditingRule(null);
    setEditorOpen(true);
  };

  const handleEditRule = (rule: PolicyRule) => {
    setEditingRule(rule);
    setEditorOpen(true);
  };

  const handleSaveRule = (rule: Partial<PolicyRule>, scope: string, scopeTarget?: string) => {
    toast.success(`Rule "${rule.name}" saved (${scope}${scopeTarget ? `: ${scopeTarget}` : ""})`);
    setEditorOpen(false);
  };

  return (
    <PolicyStudioLayout>
      <div>
        {/* Scope sub-tabs */}
        <ScopeTabs
          tabs={scopeTabs}
          active={activeScope}
          onChange={(id) => setActiveScope(id as ScopeTab)}
        />

        {/* Global sub-tab */}
        {activeScope === "global" && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            {/* Toolbar */}
            <div className="flex items-center gap-3 mb-4">
              <div className="w-[280px]">
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search rules..."
                  icon={<Search className="w-3.5 h-3.5" />}
                />
              </div>
              <Select
                value={decisionFilter}
                onChange={(e) => setDecisionFilter(e.target.value as Decision)}
                options={[
                  { value: "all", label: "All Decisions" },
                  { value: "allow", label: "ALLOW" },
                  { value: "deny", label: "DENY" },
                  { value: "require_approval", label: "REQUIRE_APPROVAL" },
                  { value: "allow_with_constraints", label: "ALLOW_WITH_CONSTRAINTS" },
                  { value: "throttle", label: "THROTTLE" },
                ]}
                className="w-48"
              />
              <Select
                value={bundleFilter}
                onChange={(e) => setBundleFilter(e.target.value)}
                options={[
                  { value: "all", label: "All Bundles" },
                  ...bundles.map((b) => ({ value: b.id, label: b.name || b.id })),
                ]}
                className="w-48"
              />
              <div className="ml-auto">
                <Button size="sm" onClick={handleNewRule}>
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  New Rule
                </Button>
              </div>
            </div>

            {/* Rules list */}
            {rulesLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
              </div>
            ) : filteredGlobalRules.length === 0 ? (
              <EmptyState
                icon={<Shield className="w-5 h-5" />}
                title="No input rules"
                description={search || decisionFilter !== "all" ? "No rules match your filters." : "Create your first input policy rule to control job execution."}
                action={
                  <Button size="sm" onClick={handleNewRule}>
                    <Plus className="w-3.5 h-3.5 mr-1" />
                    Create Rule
                  </Button>
                }
              />
            ) : (
              <div className="space-y-3">
                {filteredGlobalRules.map((rule) => (
                  <InputRuleCard
                    key={rule.id}
                    rule={rule}
                    scope="global"
                    bundleName={rule.bundle_id}
                    onEdit={() => handleEditRule(rule)}
                    onSimulate={() => toast.info("Opening simulator...")}
                    onExplain={() => toast.info("Explaining rule...")}
                    onDuplicate={() => toast.success("Rule duplicated")}
                    onToggle={() => toast.success(`Rule ${rule.enabled ? "disabled" : "enabled"}`)}
                    onDelete={() => toast.success("Rule deleted")}
                    onViewHistory={() => toast.info("Opening history...")}
                    onMoveToBundle={() => toast.info("Move to bundle...")}
                  />
                ))}
              </div>
            )}
          </motion.div>
        )}

        {/* Workflow-Scoped sub-tab */}
        {activeScope === "workflow" && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            {/* Workflow chips */}
            <div className="mb-5">
              <p className="text-xs text-muted-foreground mb-3">Select a workflow:</p>
              <div className="flex flex-wrap gap-2">
                {(workflows ?? []).map((wf) => {
                  const wfRules = workflowsWithRules.get(wf.id) ?? [];
                  const hasCustom = wfRules.length > 0;
                  const isSelected = selectedWorkflow === wf.id;
                  return (
                    <button
                      key={wf.id}
                      onClick={() => setSelectedWorkflow(isSelected ? null : wf.id)}
                      className={cn(
                        "relative px-4 py-2.5 rounded-lg border text-left transition-all min-w-[140px]",
                        isSelected
                          ? "border-cordum/40 bg-cordum/5 shadow-sm"
                          : "border-border hover:border-border/80 bg-card",
                      )}
                    >
                      <p className="text-xs font-medium text-foreground truncate">{wf.name || wf.id}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {hasCustom ? `+${wfRules.length} rule${wfRules.length !== 1 ? "s" : ""}` : "0 overrides"}
                      </p>
                      {hasCustom && (
                        <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-cordum" />
                      )}
                    </button>
                  );
                })}
                {(!workflows || workflows.length === 0) && (
                  <p className="text-xs text-muted-foreground">No workflows found.</p>
                )}
              </div>
            </div>

            {/* Selected workflow content */}
            {selectedWorkflow && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showInherited}
                      onChange={(e) => setShowInherited(e.target.checked)}
                      className="accent-[var(--color-cordum)]"
                    />
                    <span className="text-xs text-foreground">Show inherited global rules</span>
                  </label>
                  <Button size="sm" onClick={() => { setEditingRule(null); setEditorOpen(true); }}>
                    <Plus className="w-3.5 h-3.5 mr-1" />
                    New Rule
                  </Button>
                </div>

                {/* Workflow-specific rules */}
                {(() => {
                  const wfRules = workflowsWithRules.get(selectedWorkflow) ?? [];
                  return wfRules.length > 0 ? (
                    <div className="space-y-3 mb-6">
                      <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                        Workflow Rules ({wfRules.length})
                      </p>
                      {wfRules.map((rule) => (
                        <InputRuleCard
                          key={rule.id}
                          rule={rule}
                          scope="workflow"
                          scopeLabel={selectedWorkflow}
                          onEdit={() => handleEditRule(rule)}
                          onSimulate={() => toast.info("Opening simulator...")}
                          onExplain={() => toast.info("Explaining rule...")}
                          onDelete={() => toast.success("Rule deleted")}
                        />
                      ))}
                    </div>
                  ) : (
                    <EmptyState
                      icon={<GitBranch className="w-5 h-5" />}
                      title="No workflow-specific overrides"
                      description="This workflow inherits all global rules. No workflow-specific overrides."
                      action={
                        <Button size="sm" onClick={() => { setEditingRule(null); setEditorOpen(true); }}>
                          Add First Workflow Rule
                        </Button>
                      }
                    />
                  );
                })()}

                {/* Inherited global rules (dimmed) */}
                {showInherited && globalRules.length > 0 && (
                  <div className="space-y-3">
                    <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                      Inherited from Global ({globalRules.length} rules)
                    </p>
                    {globalRules.map((rule) => (
                      <InputRuleCard
                        key={rule.id}
                        rule={rule}
                        scope="inherited"
                        bundleName={rule.bundle_id}
                        dimmed
                        onEdit={() => {
                          setActiveScope("global");
                          toast.info(`Navigated to Global tab — rule: ${rule.name}`);
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {!selectedWorkflow && (workflows ?? []).length > 0 && (
              <div className="text-center py-12">
                <p className="text-xs text-muted-foreground">Select a workflow above to view its policy rules.</p>
              </div>
            )}
          </motion.div>
        )}

        {/* Tenant sub-tab */}
        {activeScope === "tenant" && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="instrument-card p-5">
              <div className="flex items-center gap-2 mb-4">
                <Shield className="w-4 h-4 text-cordum" />
                <h3 className="font-display font-semibold text-sm text-foreground">Tenant: default</h3>
              </div>

              <div className="space-y-4">
                {/* Topic Restrictions */}
                <div>
                  <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-2">Topic Restrictions</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Allowed:</p>
                      <div className="flex flex-wrap gap-1">
                        <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 text-xs font-mono">job.*</span>
                      </div>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Denied:</p>
                      <p className="text-xs text-muted-foreground italic">(none)</p>
                    </div>
                  </div>
                </div>

                {/* MCP Policy */}
                <div>
                  <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-2">MCP Policy</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Allow servers:</p>
                      <div className="flex flex-wrap gap-1">
                        <span className="px-2 py-0.5 rounded bg-surface-2 text-foreground text-xs font-mono">github</span>
                        <span className="px-2 py-0.5 rounded bg-surface-2 text-foreground text-xs font-mono">jira</span>
                      </div>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Deny servers:</p>
                      <div className="flex flex-wrap gap-1">
                        <span className="px-2 py-0.5 rounded bg-red-500/15 text-red-400 text-xs font-mono">internal-admin</span>
                      </div>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Allow tools:</p>
                      <div className="flex flex-wrap gap-1">
                        <span className="px-2 py-0.5 rounded bg-surface-2 text-foreground text-xs font-mono">search_issues</span>
                        <span className="px-2 py-0.5 rounded bg-surface-2 text-foreground text-xs font-mono">get_issue</span>
                      </div>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Deny tools:</p>
                      <div className="flex flex-wrap gap-1">
                        <span className="px-2 py-0.5 rounded bg-red-500/15 text-red-400 text-xs font-mono">delete_issue</span>
                      </div>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Allow actions:</p>
                      <div className="flex flex-wrap gap-1">
                        <span className="px-2 py-0.5 rounded bg-surface-2 text-foreground text-xs font-mono">read</span>
                        <span className="px-2 py-0.5 rounded bg-surface-2 text-foreground text-xs font-mono">list</span>
                      </div>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Deny actions:</p>
                      <div className="flex flex-wrap gap-1">
                        <span className="px-2 py-0.5 rounded bg-red-500/15 text-red-400 text-xs font-mono">write</span>
                        <span className="px-2 py-0.5 rounded bg-red-500/15 text-red-400 text-xs font-mono">delete</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pt-2">
                  <Button variant="outline" size="sm" onClick={() => toast.info("Edit tenant policy — coming soon")}>
                    Edit Tenant Policy
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </div>

      {/* Rule Editor slide-over */}
      <InputRuleEditor
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        onSave={handleSaveRule}
        rule={editingRule}
        defaultScope={activeScope === "workflow" ? "workflow" : activeScope === "tenant" ? "tenant" : "global"}
        defaultScopeTarget={activeScope === "workflow" ? selectedWorkflow ?? undefined : undefined}
        bundles={bundles.map((b) => ({ id: b.id, name: b.name || b.id }))}
        workflows={(workflows ?? []).map((w) => ({ id: w.id, name: w.name || w.id }))}
        globalRules={globalRules}
      />
    </PolicyStudioLayout>
  );
}
