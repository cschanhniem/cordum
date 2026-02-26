/*
 * InputRuleEditor — Slide-over panel (560px) for creating/editing input policy rules.
 * Scope-aware: pre-selects scope based on context.
 * Sections: Scope, Identity, Match Basic, Match Advanced, MCP Filters, Decision, Constraints, YAML Preview.
 */
import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  Server,
  Copy,
  Save,
  FlaskConical,
} from "lucide-react";
import YAML from "yaml";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import type { PolicyRule, PolicyRuleMatch, McpMatchConfig, SafetyDecisionType } from "@/api/types";
import { toast } from "sonner";

type Scope = "global" | "workflow" | "tenant";
type Decision = "allow" | "deny" | "require_approval" | "allow_with_constraints" | "throttle";

interface InputRuleEditorProps {
  open: boolean;
  onClose: () => void;
  onSave: (rule: Partial<PolicyRule>, scope: Scope, scopeTarget?: string) => void;
  onSaveAndSimulate?: (rule: Partial<PolicyRule>, scope: Scope, scopeTarget?: string) => void;
  rule?: PolicyRule | null;
  defaultScope?: Scope;
  defaultScopeTarget?: string; // workflow ID or tenant ID
  bundles?: { id: string; name: string }[];
  workflows?: { id: string; name: string }[];
  tenants?: string[];
  globalRules?: PolicyRule[]; // For override conflict detection
}

function ChipInput({
  label,
  values,
  onChange,
  placeholder,
}: {
  label: string;
  values: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  const [input, setInput] = useState("");
  const add = () => {
    const trimmed = input.trim();
    if (trimmed && !values.includes(trimmed)) {
      onChange([...values, trimmed]);
    }
    setInput("");
  };
  return (
    <div>
      <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider block mb-1.5">{label}</label>
      <div className="flex flex-wrap gap-1.5 mb-1.5">
        {values.map((v) => (
          <span key={v} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-surface-2 text-xs text-foreground border border-border">
            {v}
            <button onClick={() => onChange(values.filter((x) => x !== v))} className="text-muted-foreground hover:text-red-400">
              <X className="w-2.5 h-2.5" />
            </button>
          </span>
        ))}
      </div>
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
        placeholder={placeholder}
        className="w-full h-8 px-2.5 text-xs bg-surface-0 border border-border rounded-md text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-cordum/30"
      />
    </div>
  );
}

function LabelEditor({
  labels,
  onChange,
}: {
  labels: Record<string, string>;
  onChange: (l: Record<string, string>) => void;
}) {
  const [key, setKey] = useState("");
  const [val, setVal] = useState("");
  const add = () => {
    if (key.trim()) {
      onChange({ ...labels, [key.trim()]: val.trim() });
      setKey("");
      setVal("");
    }
  };
  return (
    <div>
      <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider block mb-1.5">Labels</label>
      <div className="space-y-1 mb-1.5">
        {Object.entries(labels).map(([k, v]) => (
          <div key={k} className="flex items-center gap-1.5">
            <span className="text-xs font-mono text-foreground bg-surface-2 px-2 py-0.5 rounded">{k}={v}</span>
            <button onClick={() => { const next = { ...labels }; delete next[k]; onChange(next); }} className="text-muted-foreground hover:text-red-400">
              <X className="w-2.5 h-2.5" />
            </button>
          </div>
        ))}
      </div>
      <div className="flex gap-1.5">
        <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="key" className="flex-1 h-7 px-2 text-xs bg-surface-0 border border-border rounded-md text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-cordum/30" />
        <input value={val} onChange={(e) => setVal(e.target.value)} placeholder="value" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} className="flex-1 h-7 px-2 text-xs bg-surface-0 border border-border rounded-md text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-cordum/30" />
        <button onClick={add} className="h-7 px-2 text-xs bg-surface-2 border border-border rounded-md text-foreground hover:bg-surface-2/80">+</button>
      </div>
    </div>
  );
}

function CollapsibleSection({ title, icon, children, defaultOpen = false }: { title: string; icon?: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-2 w-full px-4 py-2.5 text-xs font-medium text-foreground hover:bg-surface-2/50 transition-colors">
        {icon}
        {title}
        <span className="ml-auto">{open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-1 space-y-3 border-t border-border">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function InputRuleEditor({
  open,
  onClose,
  onSave,
  onSaveAndSimulate,
  rule,
  defaultScope = "global",
  defaultScopeTarget,
  bundles = [],
  workflows = [],
  tenants = ["default"],
  globalRules = [],
}: InputRuleEditorProps) {
  const isEdit = !!rule;

  // Form state
  const [scope, setScope] = useState<Scope>(defaultScope);
  const [scopeTarget, setScopeTarget] = useState(defaultScopeTarget ?? "");
  const [bundleId, setBundleId] = useState(bundles[0]?.id ?? "default");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState(50);
  const [enabled, setEnabled] = useState(true);
  const [decision, setDecision] = useState<Decision>("deny");

  // Match
  const [topics, setTopics] = useState<string[]>([]);
  const [matchTenants, setMatchTenants] = useState<string[]>([]);
  const [actorIds, setActorIds] = useState<string[]>([]);
  const [actorTypes, setActorTypes] = useState<string[]>([]);
  const [capabilities, setCapabilities] = useState<string[]>([]);
  const [riskTags, setRiskTags] = useState<string[]>([]);
  const [requires, setRequires] = useState<string[]>([]);
  const [packIds, setPackIds] = useState<string[]>([]);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [secretsPresent, setSecretsPresent] = useState(false);

  // MCP
  const [mcpAllowServers, setMcpAllowServers] = useState<string[]>([]);
  const [mcpDenyServers, setMcpDenyServers] = useState<string[]>([]);
  const [mcpAllowTools, setMcpAllowTools] = useState<string[]>([]);
  const [mcpDenyTools, setMcpDenyTools] = useState<string[]>([]);
  const [mcpAllowResources, setMcpAllowResources] = useState<string[]>([]);
  const [mcpDenyResources, setMcpDenyResources] = useState<string[]>([]);
  const [mcpAllowActions, setMcpAllowActions] = useState<string[]>([]);
  const [mcpDenyActions, setMcpDenyActions] = useState<string[]>([]);

  // Constraints (for allow_with_constraints)
  const [maxRuntime, setMaxRuntime] = useState("");
  const [maxRetries, setMaxRetries] = useState("");
  const [maxArtifacts, setMaxArtifacts] = useState("");
  const [maxConcurrent, setMaxConcurrent] = useState("");
  const [sandboxIsolated, setSandboxIsolated] = useState(false);
  const [networkAllow, setNetworkAllow] = useState<string[]>([]);
  const [fsReadOnly, setFsReadOnly] = useState<string[]>([]);
  const [fsReadWrite, setFsReadWrite] = useState<string[]>([]);
  const [allowedTools, setAllowedTools] = useState<string[]>([]);
  const [allowedCommands, setAllowedCommands] = useState<string[]>([]);
  const [diffMaxFiles, setDiffMaxFiles] = useState("");
  const [diffMaxLines, setDiffMaxLines] = useState("");
  const [diffDenyPaths, setDiffDenyPaths] = useState<string[]>([]);
  const [redaction, setRedaction] = useState("none");

  // Reset form when rule changes
  useEffect(() => {
    if (rule) {
      setScope(defaultScope);
      setScopeTarget(defaultScopeTarget ?? "");
      setBundleId(rule.bundle_id ?? bundles[0]?.id ?? "default");
      setName(rule.name ?? "");
      setDescription(rule.description ?? "");
      setPriority(rule.priority ?? 50);
      setEnabled(rule.enabled ?? true);
      setDecision((rule.decision?.toLowerCase() as Decision) ?? "deny");
      setTopics(rule.match?.topics ?? []);
      setMatchTenants(rule.match?.tenants ?? []);
      setActorIds(rule.match?.actor_ids ?? []);
      setActorTypes(rule.match?.actor_types ?? []);
      setCapabilities(rule.match?.capabilities ?? []);
      setRiskTags(rule.match?.risk_tags ?? []);
      setRequires(rule.match?.requires ?? []);
      setPackIds(rule.match?.pack_ids ?? []);
      setLabels(rule.match?.labels ?? {});
      setSecretsPresent(rule.match?.secrets_present ?? false);
      setMcpAllowServers(rule.match?.mcp?.allow_servers ?? []);
      setMcpDenyServers(rule.match?.mcp?.deny_servers ?? []);
      setMcpAllowTools(rule.match?.mcp?.allow_tools ?? []);
      setMcpDenyTools(rule.match?.mcp?.deny_tools ?? []);
      setMcpAllowResources(rule.match?.mcp?.allow_resources ?? []);
      setMcpDenyResources(rule.match?.mcp?.deny_resources ?? []);
      setMcpAllowActions(rule.match?.mcp?.allow_actions ?? []);
      setMcpDenyActions(rule.match?.mcp?.deny_actions ?? []);
      // Constraints
      const c = rule.constraints;
      if (c) {
        setMaxRuntime(c.budgets?.max_runtime_ms?.toString() ?? "");
        setMaxRetries(c.budgets?.max_retries?.toString() ?? "");
        setMaxArtifacts(c.budgets?.max_artifact_bytes?.toString() ?? "");
        setMaxConcurrent(c.budgets?.max_concurrent_jobs?.toString() ?? "");
        setSandboxIsolated(c.sandbox?.isolated ?? false);
        setNetworkAllow(c.sandbox?.network_allowlist ?? []);
        setFsReadOnly(c.sandbox?.fs_read_only ?? []);
        setFsReadWrite(c.sandbox?.fs_read_write ?? []);
        setAllowedTools(c.toolchain?.allowed_tools ?? []);
        setAllowedCommands(c.toolchain?.allowed_commands ?? []);
        setDiffMaxFiles("");
        setDiffMaxLines("");
        setDiffDenyPaths([]);
        setRedaction("none");
      }
    } else {
      // New rule defaults
      setScope(defaultScope);
      setScopeTarget(defaultScopeTarget ?? "");
      setBundleId(bundles[0]?.id ?? "default");
      setName("");
      setDescription("");
      setPriority(50);
      setEnabled(true);
      setDecision("deny");
      setTopics([]);
      setMatchTenants([]);
      setActorIds([]);
      setActorTypes([]);
      setCapabilities([]);
      setRiskTags([]);
      setRequires([]);
      setPackIds([]);
      setLabels({});
      setSecretsPresent(false);
      setMcpAllowServers([]);
      setMcpDenyServers([]);
      setMcpAllowTools([]);
      setMcpDenyTools([]);
      setMcpAllowResources([]);
      setMcpDenyResources([]);
      setMcpAllowActions([]);
      setMcpDenyActions([]);
      setMaxRuntime("");
      setMaxRetries("");
      setMaxArtifacts("");
      setMaxConcurrent("");
      setSandboxIsolated(false);
      setNetworkAllow([]);
      setFsReadOnly([]);
      setFsReadWrite([]);
      setAllowedTools([]);
      setAllowedCommands([]);
      setDiffMaxFiles("");
      setDiffMaxLines("");
      setDiffDenyPaths([]);
      setRedaction("none");
    }
  }, [rule, open, defaultScope, defaultScopeTarget]);

  // Override conflict detection
  const overrideWarning = useMemo(() => {
    if (scope !== "workflow" || !topics.length) return null;
    for (const gr of globalRules) {
      if (gr.decision?.toLowerCase() === "deny" && gr.match?.topics) {
        for (const gt of gr.match.topics) {
          for (const t of topics) {
            // Simple glob match check
            if (gt === "*" || gt === t || (gt.endsWith("*") && t.startsWith(gt.slice(0, -1)))) {
              if (decision === "allow") {
                return { ruleName: gr.name, topic: gt };
              }
            }
          }
        }
      }
    }
    return null;
  }, [scope, topics, decision, globalRules]);

  // Build YAML preview
  const yamlPreview = useMemo(() => {
    const matchObj: Record<string, unknown> = {};
    if (topics.length) matchObj.topics = topics;
    if (matchTenants.length) matchObj.tenants = matchTenants;
    if (actorIds.length) matchObj.actor_ids = actorIds;
    if (actorTypes.length) matchObj.actor_types = actorTypes;
    if (capabilities.length) matchObj.capabilities = capabilities;
    if (riskTags.length) matchObj.risk_tags = riskTags;
    if (requires.length) matchObj.requires = requires;
    if (packIds.length) matchObj.pack_ids = packIds;
    if (Object.keys(labels).length) matchObj.labels = labels;
    if (secretsPresent) matchObj.secrets_present = true;
    const mcpObj: Record<string, string[]> = {};
    if (mcpAllowServers.length) mcpObj.allow_servers = mcpAllowServers;
    if (mcpDenyServers.length) mcpObj.deny_servers = mcpDenyServers;
    if (mcpAllowTools.length) mcpObj.allow_tools = mcpAllowTools;
    if (mcpDenyTools.length) mcpObj.deny_tools = mcpDenyTools;
    if (mcpAllowResources.length) mcpObj.allow_resources = mcpAllowResources;
    if (mcpDenyResources.length) mcpObj.deny_resources = mcpDenyResources;
    if (mcpAllowActions.length) mcpObj.allow_actions = mcpAllowActions;
    if (mcpDenyActions.length) mcpObj.deny_actions = mcpDenyActions;
    if (Object.keys(mcpObj).length) matchObj.mcp = mcpObj;

    const ruleObj: Record<string, unknown> = {
      id: name || "new-rule",
      name: name || "new-rule",
      decision: decision.toUpperCase(),
      priority,
      enabled,
    };
    if (description) ruleObj.description = description;
    if (Object.keys(matchObj).length) ruleObj.match = matchObj;

    if (decision === "allow_with_constraints") {
      const constraints: Record<string, unknown> = {};
      const budgets: Record<string, number> = {};
      if (maxRuntime) budgets.max_runtime_ms = parseInt(maxRuntime);
      if (maxRetries) budgets.max_retries = parseInt(maxRetries);
      if (maxArtifacts) budgets.max_artifacts_bytes = parseInt(maxArtifacts);
      if (maxConcurrent) budgets.max_concurrent = parseInt(maxConcurrent);
      if (Object.keys(budgets).length) constraints.budgets = budgets;
      if (sandboxIsolated) constraints.sandbox = "isolated";
      if (networkAllow.length) constraints.network_allow = networkAllow;
      if (redaction !== "none") constraints.redaction = redaction;
      if (Object.keys(constraints).length) ruleObj.constraints = constraints;
    }

    return YAML.stringify({ rules: [ruleObj] }, { indent: 2 });
  }, [name, description, priority, enabled, decision, topics, matchTenants, actorIds, actorTypes, capabilities, riskTags, requires, packIds, labels, secretsPresent, mcpAllowServers, mcpDenyServers, mcpAllowTools, mcpDenyTools, mcpAllowResources, mcpDenyResources, mcpAllowActions, mcpDenyActions, maxRuntime, maxRetries, maxArtifacts, maxConcurrent, sandboxIsolated, networkAllow, redaction]);

  const handleSave = () => {
    if (!name.trim()) {
      toast.error("Rule name is required");
      return;
    }
    const matchObj: PolicyRuleMatch = {};
    if (topics.length) matchObj.topics = topics;
    if (matchTenants.length) matchObj.tenants = matchTenants;
    if (actorIds.length) matchObj.actor_ids = actorIds;
    if (actorTypes.length) matchObj.actor_types = actorTypes;
    if (capabilities.length) matchObj.capabilities = capabilities;
    if (riskTags.length) matchObj.risk_tags = riskTags;
    if (requires.length) matchObj.requires = requires;
    if (packIds.length) matchObj.pack_ids = packIds;
    if (Object.keys(labels).length) matchObj.labels = labels;
    if (secretsPresent) matchObj.secrets_present = true;
    const mcpObj: McpMatchConfig = {};
    if (mcpAllowServers.length) mcpObj.allow_servers = mcpAllowServers;
    if (mcpDenyServers.length) mcpObj.deny_servers = mcpDenyServers;
    if (mcpAllowTools.length) mcpObj.allow_tools = mcpAllowTools;
    if (mcpDenyTools.length) mcpObj.deny_tools = mcpDenyTools;
    if (Object.keys(mcpObj).length) matchObj.mcp = mcpObj;

    const result: Partial<PolicyRule> = {
      id: rule?.id ?? name,
      name,
      description: description || undefined,
      priority,
      enabled,
      decision: decision as SafetyDecisionType,
      match: matchObj,
      bundle_id: scope === "global" ? bundleId : undefined,
    };

    if (decision === "allow_with_constraints") {
      result.constraints = {
        budgets: {
          max_runtime_ms: maxRuntime ? parseInt(maxRuntime) : undefined,
          max_retries: maxRetries ? parseInt(maxRetries) : undefined,
          max_artifact_bytes: maxArtifacts ? parseInt(maxArtifacts) : undefined,
          max_concurrent_jobs: maxConcurrent ? parseInt(maxConcurrent) : undefined,
        },
        sandbox: sandboxIsolated ? { isolated: true, network_allowlist: networkAllow.length ? networkAllow : undefined } : undefined,
      };
    }

    onSave(result, scope, scopeTarget || undefined);
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[90] bg-black/50 backdrop-blur-sm"
            onClick={onClose}
          />
          {/* Panel */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="fixed right-0 top-0 bottom-0 z-[91] w-[560px] max-w-full bg-surface-1 border-l border-border shadow-2xl flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
              <h2 className="font-display font-semibold text-foreground">
                {isEdit ? "Edit Input Rule" : "Create Input Rule"}
              </h2>
              <button onClick={onClose} className="p-1.5 rounded-md hover:bg-surface-2 text-muted-foreground hover:text-foreground transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Scrollable form */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

              {/* Section 0: Scope */}
              <div className="space-y-3">
                <h3 className="text-xs font-semibold text-foreground">Where does this rule live?</h3>
                <div className="space-y-2">
                  {/* Global */}
                  <label className={cn("flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors", scope === "global" ? "border-cordum/40 bg-cordum/5" : "border-border hover:border-border/80")}>
                    <input type="radio" name="scope" checked={scope === "global"} onChange={() => setScope("global")} className="mt-0.5 accent-[var(--color-cordum)]" />
                    <div>
                      <p className="text-xs font-medium text-foreground">Global (System)</p>
                      <p className="text-[10px] text-muted-foreground">Applies to all jobs across all workflows.</p>
                      {scope === "global" && (
                        <div className="mt-2">
                          <Select
                            value={bundleId}
                            onChange={(e) => setBundleId(e.target.value)}
                            options={bundles.length ? bundles.map((b) => ({ value: b.id, label: b.name || b.id })) : [{ value: "default", label: "default" }]}
                            placeholder="Select bundle"
                            className="w-48"
                          />
                        </div>
                      )}
                    </div>
                  </label>
                  {/* Workflow */}
                  <label className={cn("flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors", scope === "workflow" ? "border-blue-500/40 bg-blue-500/5" : "border-border hover:border-border/80")}>
                    <input type="radio" name="scope" checked={scope === "workflow"} onChange={() => setScope("workflow")} className="mt-0.5 accent-[var(--color-info)]" />
                    <div>
                      <p className="text-xs font-medium text-foreground">Workflow-Scoped</p>
                      <p className="text-[10px] text-muted-foreground">Applies only to jobs in a specific workflow.</p>
                      {scope === "workflow" && (
                        <div className="mt-2">
                          <Select
                            value={scopeTarget}
                            onChange={(e) => setScopeTarget(e.target.value)}
                            options={workflows.map((w) => ({ value: w.id, label: w.name || w.id }))}
                            placeholder="Select workflow"
                            className="w-48"
                          />
                          <p className="text-[10px] text-muted-foreground mt-1.5">
                            This rule adds to inherited global rules. Lower scopes cannot override a global DENY to ALLOW.
                          </p>
                        </div>
                      )}
                    </div>
                  </label>
                  {/* Tenant */}
                  <label className={cn("flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors", scope === "tenant" ? "border-purple-500/40 bg-purple-500/5" : "border-border hover:border-border/80")}>
                    <input type="radio" name="scope" checked={scope === "tenant"} onChange={() => setScope("tenant")} className="mt-0.5 accent-purple-500" />
                    <div>
                      <p className="text-xs font-medium text-foreground">Tenant</p>
                      <p className="text-[10px] text-muted-foreground">Applies to all jobs in a specific tenant.</p>
                      {scope === "tenant" && (
                        <div className="mt-2">
                          <Select
                            value={scopeTarget}
                            onChange={(e) => setScopeTarget(e.target.value)}
                            options={tenants.map((t) => ({ value: t, label: t }))}
                            placeholder="Select tenant"
                            className="w-48"
                          />
                        </div>
                      )}
                    </div>
                  </label>
                </div>
              </div>

              {/* Override warning */}
              {overrideWarning && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div className="text-xs text-amber-300">
                    <p className="font-medium">Global rule "{overrideWarning.ruleName}" already DENIES topic "{overrideWarning.topic}"</p>
                    <p className="text-amber-400/80 mt-0.5">Workflow rules cannot override to ALLOW. You can: add REQUIRE_APPROVAL or ALLOW_WITH_CONSTRAINTS.</p>
                  </div>
                </div>
              )}

              {/* Section 1: Identity */}
              <div className="space-y-3">
                <h3 className="text-xs font-semibold text-foreground">Identity</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider block mb-1">Rule Name</label>
                    <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. production-restart-gate" />
                  </div>
                  <div className="col-span-2">
                    <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider block mb-1">Description</label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Human-readable description"
                      rows={2}
                      className="w-full px-3 py-2 text-sm bg-surface-2/50 border border-border rounded-md text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-cordum/30 focus:border-cordum/40 resize-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider block mb-1">Priority (1–1000)</label>
                    <Input type="number" value={priority} onChange={(e) => setPriority(parseInt(e.target.value) || 50)} min={1} max={1000} />
                  </div>
                  <div className="flex items-end">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="accent-[var(--color-cordum)]" />
                      <span className="text-xs text-foreground">Enabled</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Section 2: Match — Basic */}
              <div className="space-y-3">
                <h3 className="text-xs font-semibold text-foreground">Match Criteria</h3>
                <ChipInput label="Topic Pattern" values={topics} onChange={setTopics} placeholder="e.g. service.* or job.fraud.*" />
                {scope !== "tenant" && (
                  <ChipInput label="Tenants" values={matchTenants} onChange={setMatchTenants} placeholder="Tenant scope (empty = all)" />
                )}
                <ChipInput label="Actor IDs" values={actorIds} onChange={setActorIds} placeholder="Specific agent filter" />
                <ChipInput label="Actor Types" values={actorTypes} onChange={setActorTypes} placeholder="Agent type filter" />
              </div>

              {/* Section 3: Match — Advanced (collapsed) */}
              <CollapsibleSection title="Advanced Match Criteria">
                <ChipInput label="Capabilities" values={capabilities} onChange={setCapabilities} placeholder="Required worker capabilities" />
                <ChipInput label="Risk Tags" values={riskTags} onChange={setRiskTags} placeholder="Risk classification" />
                <ChipInput label="Requires" values={requires} onChange={setRequires} placeholder="All must be present" />
                <ChipInput label="Pack IDs" values={packIds} onChange={setPackIds} placeholder="Pack scope" />
                <LabelEditor labels={labels} onChange={setLabels} />
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={secretsPresent} onChange={(e) => setSecretsPresent(e.target.checked)} className="accent-[var(--color-cordum)]" />
                  <span className="text-xs text-foreground">Job carries secrets</span>
                </label>
              </CollapsibleSection>

              {/* Section 4: MCP Filters (collapsed) */}
              <CollapsibleSection title="MCP Filters" icon={<Server className="w-3.5 h-3.5" />}>
                <p className="text-[10px] text-muted-foreground">Deny takes precedence over Allow. If both lists are empty, all values are allowed.</p>
                <div className="grid grid-cols-2 gap-3">
                  <ChipInput label="Allow Servers" values={mcpAllowServers} onChange={setMcpAllowServers} placeholder="server name" />
                  <ChipInput label="Deny Servers" values={mcpDenyServers} onChange={setMcpDenyServers} placeholder="server name" />
                  <ChipInput label="Allow Tools" values={mcpAllowTools} onChange={setMcpAllowTools} placeholder="tool name" />
                  <ChipInput label="Deny Tools" values={mcpDenyTools} onChange={setMcpDenyTools} placeholder="tool name" />
                  <ChipInput label="Allow Resources" values={mcpAllowResources} onChange={setMcpAllowResources} placeholder="resource" />
                  <ChipInput label="Deny Resources" values={mcpDenyResources} onChange={setMcpDenyResources} placeholder="resource" />
                  <ChipInput label="Allow Actions" values={mcpAllowActions} onChange={setMcpAllowActions} placeholder="action" />
                  <ChipInput label="Deny Actions" values={mcpDenyActions} onChange={setMcpDenyActions} placeholder="action" />
                </div>
              </CollapsibleSection>

              {/* Section 5: Decision */}
              <div className="space-y-3">
                <h3 className="text-xs font-semibold text-foreground">Decision</h3>
                <Select
                  value={decision}
                  onChange={(e) => setDecision(e.target.value as Decision)}
                  options={[
                    { value: "allow", label: "ALLOW" },
                    { value: "deny", label: "DENY" },
                    { value: "require_approval", label: "REQUIRE_APPROVAL" },
                    { value: "allow_with_constraints", label: "ALLOW_WITH_CONSTRAINTS" },
                    { value: "throttle", label: "THROTTLE" },
                  ]}
                />
              </div>

              {/* Section 6: Constraints (only for allow_with_constraints) */}
              {decision === "allow_with_constraints" && (
                <div className="space-y-3">
                  <h3 className="text-xs font-semibold text-foreground">Constraints</h3>

                  <CollapsibleSection title="Budgets" defaultOpen>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider block mb-1">Max Runtime (ms)</label>
                        <Input type="number" value={maxRuntime} onChange={(e) => setMaxRuntime(e.target.value)} placeholder="e.g. 30000" />
                      </div>
                      <div>
                        <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider block mb-1">Max Retries</label>
                        <Input type="number" value={maxRetries} onChange={(e) => setMaxRetries(e.target.value)} placeholder="e.g. 3" />
                      </div>
                      <div>
                        <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider block mb-1">Max Artifacts (bytes)</label>
                        <Input type="number" value={maxArtifacts} onChange={(e) => setMaxArtifacts(e.target.value)} placeholder="e.g. 1048576" />
                      </div>
                      <div>
                        <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider block mb-1">Max Concurrent</label>
                        <Input type="number" value={maxConcurrent} onChange={(e) => setMaxConcurrent(e.target.value)} placeholder="e.g. 5" />
                      </div>
                    </div>
                  </CollapsibleSection>

                  <CollapsibleSection title="Sandbox">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={sandboxIsolated} onChange={(e) => setSandboxIsolated(e.target.checked)} className="accent-[var(--color-cordum)]" />
                      <span className="text-xs text-foreground">Isolated sandbox</span>
                    </label>
                    <ChipInput label="Network Allow" values={networkAllow} onChange={setNetworkAllow} placeholder="e.g. api.internal.com" />
                    <ChipInput label="FS Read-Only" values={fsReadOnly} onChange={setFsReadOnly} placeholder="path" />
                    <ChipInput label="FS Read-Write" values={fsReadWrite} onChange={setFsReadWrite} placeholder="path" />
                  </CollapsibleSection>

                  <CollapsibleSection title="Toolchain">
                    <ChipInput label="Allowed Tools" values={allowedTools} onChange={setAllowedTools} placeholder="tool name" />
                    <ChipInput label="Allowed Commands" values={allowedCommands} onChange={setAllowedCommands} placeholder="command" />
                  </CollapsibleSection>

                  <CollapsibleSection title="Diff Limits">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider block mb-1">Max Files</label>
                        <Input type="number" value={diffMaxFiles} onChange={(e) => setDiffMaxFiles(e.target.value)} />
                      </div>
                      <div>
                        <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider block mb-1">Max Lines</label>
                        <Input type="number" value={diffMaxLines} onChange={(e) => setDiffMaxLines(e.target.value)} />
                      </div>
                    </div>
                    <ChipInput label="Deny Path Globs" values={diffDenyPaths} onChange={setDiffDenyPaths} placeholder="e.g. *.env" />
                  </CollapsibleSection>

                  <div>
                    <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider block mb-1">Redaction Level</label>
                    <Select
                      value={redaction}
                      onChange={(e) => setRedaction(e.target.value)}
                      options={[
                        { value: "none", label: "None" },
                        { value: "partial", label: "Partial" },
                        { value: "full", label: "Full" },
                      ]}
                    />
                  </div>
                </div>
              )}

              {/* Section 7: YAML Preview */}
              <CollapsibleSection title="YAML Preview">
                <div className="relative">
                  <pre className="text-[11px] font-mono text-foreground bg-surface-0 border border-border rounded-md p-3 overflow-x-auto max-h-64 whitespace-pre">
                    {yamlPreview}
                  </pre>
                  <button
                    onClick={() => { navigator.clipboard.writeText(yamlPreview); toast.success("YAML copied"); }}
                    className="absolute top-2 right-2 p-1 rounded bg-surface-2 hover:bg-surface-2/80 text-muted-foreground hover:text-foreground"
                  >
                    <Copy className="w-3 h-3" />
                  </button>
                </div>
              </CollapsibleSection>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border shrink-0 bg-surface-0/50">
              <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
              {onSaveAndSimulate && (
                <Button variant="outline" size="sm" onClick={() => { handleSave(); }}>
                  <FlaskConical className="w-3.5 h-3.5 mr-1" />
                  Save & Simulate
                </Button>
              )}
              <Button size="sm" onClick={handleSave}>
                <Save className="w-3.5 h-3.5 mr-1" />
                Save
              </Button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
