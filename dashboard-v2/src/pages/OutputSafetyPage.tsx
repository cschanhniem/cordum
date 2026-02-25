/*
 * DESIGN: "Control Surface" — Output Safety
 * Output quarantine queue, findings detail, redaction preview, policy rules
 */
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { get, post } from "@/api/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonTable, SkeletonCard } from "@/components/ui/Skeleton";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  ShieldAlert, CheckCircle2, XCircle, Eye, Search, RefreshCw,
  AlertTriangle, Save, ChevronDown, ChevronRight, Shield,
  FileText, Lock, Unlock, Filter, BarChart3,
} from "lucide-react";
import { cn, formatRelativeTime } from "@/lib/utils";
import { toast } from "sonner";
import type { OutputSafetyRecord, OutputFinding, OutputPolicyRule } from "@/api/types";

interface QuarantinedOutput {
  id: string;
  jobId: string;
  reason: string;
  severity: "high" | "medium" | "low";
  detectedAt: string;
  preview: string;
  decision: "QUARANTINE" | "REDACT";
  scanner?: string;
  findings?: OutputFinding[];
  rule_id?: string;
  redacted_preview?: string;
}

/* Mock quarantine data */
const mockQuarantined: QuarantinedOutput[] = [
  {
    id: "q-001",
    jobId: "job-a1b2c3d4",
    reason: "PII detected: Social Security Number pattern",
    severity: "high",
    detectedAt: new Date(Date.now() - 120000).toISOString(),
    preview: "The user's SSN is 123-45-6789 and their address is...",
    decision: "QUARANTINE",
    scanner: "pii-scanner",
    findings: [
      { type: "PII", severity: "high", detail: "SSN pattern detected", scanner: "pii-scanner", confidence: 0.98, matched_pattern: "\\d{3}-\\d{2}-\\d{4}", offset: 20, length: 11 },
    ],
    rule_id: "output-pii-block",
  },
  {
    id: "q-002",
    jobId: "job-e5f6g7h8",
    reason: "Credential leak: API key detected in output",
    severity: "high",
    detectedAt: new Date(Date.now() - 300000).toISOString(),
    preview: "Here's the configuration: OPENAI_API_KEY=sk-proj-abc123...",
    decision: "REDACT",
    scanner: "secret-scanner",
    findings: [
      { type: "SECRET", severity: "high", detail: "OpenAI API key detected", scanner: "secret-scanner", confidence: 0.95, matched_pattern: "sk-proj-[a-zA-Z0-9]+", offset: 38, length: 18 },
    ],
    rule_id: "output-secret-redact",
    redacted_preview: "Here's the configuration: OPENAI_API_KEY=[REDACTED]...",
  },
  {
    id: "q-003",
    jobId: "job-i9j0k1l2",
    reason: "Harmful content: Instructions for bypassing security",
    severity: "medium",
    detectedAt: new Date(Date.now() - 600000).toISOString(),
    preview: "To bypass the authentication, you can modify the JWT token by...",
    decision: "QUARANTINE",
    scanner: "content-safety",
    findings: [
      { type: "HARMFUL", severity: "medium", detail: "Security bypass instructions", scanner: "content-safety", confidence: 0.82 },
    ],
    rule_id: "output-harmful-block",
  },
  {
    id: "q-004",
    jobId: "job-m3n4o5p6",
    reason: "PII detected: Email addresses in bulk",
    severity: "low",
    detectedAt: new Date(Date.now() - 900000).toISOString(),
    preview: "Contact list: john@example.com, jane@corp.com, admin@...",
    decision: "REDACT",
    scanner: "pii-scanner",
    findings: [
      { type: "PII", severity: "low", detail: "Multiple email addresses", scanner: "pii-scanner", confidence: 0.90, matched_pattern: "[\\w.-]+@[\\w.-]+", offset: 14, length: 50 },
    ],
    rule_id: "output-pii-redact",
    redacted_preview: "Contact list: [REDACTED], [REDACTED], [REDACTED]...",
  },
];

const mockOutputRules: OutputPolicyRule[] = [
  { id: "output-pii-block", match: { type: "PII", severity: "high" }, decision: "QUARANTINE", reason: "Block high-severity PII in outputs", enabled: true },
  { id: "output-pii-redact", match: { type: "PII", severity: "low" }, decision: "REDACT", reason: "Redact low-severity PII", enabled: true },
  { id: "output-secret-redact", match: { type: "SECRET" }, decision: "REDACT", reason: "Auto-redact detected secrets", enabled: true },
  { id: "output-harmful-block", match: { type: "HARMFUL" }, decision: "QUARANTINE", reason: "Quarantine harmful content", enabled: true },
  { id: "output-code-injection", match: { type: "CODE_INJECTION" }, decision: "QUARANTINE", reason: "Block code injection attempts", enabled: false },
];

export default function OutputSafetyPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"quarantine" | "rules" | "settings">("quarantine");
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [releaseTarget, setReleaseTarget] = useState<QuarantinedOutput | null>(null);
  const [sensitiveDataEnabled, setSensitiveDataEnabled] = useState(true);
  const [autoQuarantine, setAutoQuarantine] = useState(true);
  const [severityFilter, setSeverityFilter] = useState("all");
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());

  // In production: useQuery for GET /api/v1/safety/output/quarantine
  const quarantined = mockQuarantined;
  const isLoading = false;

  const filtered = useMemo(() => {
    if (severityFilter === "all") return quarantined;
    return quarantined.filter(q => q.severity === severityFilter);
  }, [quarantined, severityFilter]);

  const severityColor = (s: string) => s === "high" ? "danger" : s === "medium" ? "warning" : "info";

  const toggleSelect = (id: string) => {
    setSelectedItems(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBulkRelease = () => {
    toast.success(`Released ${selectedItems.size} items`);
    setSelectedItems(new Set());
  };

  const handleBulkDiscard = () => {
    toast.success(`Discarded ${selectedItems.size} items`);
    setSelectedItems(new Set());
  };

  const tabs = [
    { id: "quarantine" as const, label: "Quarantine", icon: ShieldAlert, count: quarantined.length },
    { id: "rules" as const, label: "Output Rules", icon: Shield, count: mockOutputRules.length },
    { id: "settings" as const, label: "Settings", icon: Save },
  ];

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <PageHeader
        label="Govern"
        title="Output Safety"
        subtitle={`${quarantined.length} quarantined · ${mockOutputRules.filter(r => r.enabled).length} active rules`}
      />

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className={cn("instrument-card p-4", quarantined.filter(q => q.severity === "high").length > 0 && "status-danger")}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">High Severity</span>
            <AlertTriangle className="w-4 h-4 text-red-400" />
          </div>
          <span className="font-mono text-2xl font-bold text-red-400">{quarantined.filter(q => q.severity === "high").length}</span>
        </div>
        <div className="instrument-card p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">Quarantined</span>
            <Lock className="w-4 h-4 text-amber-400" />
          </div>
          <span className="font-mono text-2xl font-bold text-foreground">{quarantined.filter(q => q.decision === "QUARANTINE").length}</span>
        </div>
        <div className="instrument-card p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">Redacted</span>
            <FileText className="w-4 h-4 text-blue-400" />
          </div>
          <span className="font-mono text-2xl font-bold text-foreground">{quarantined.filter(q => q.decision === "REDACT").length}</span>
        </div>
        <div className="instrument-card p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">Active Rules</span>
            <Shield className="w-4 h-4 text-cordum" />
          </div>
          <span className="font-mono text-2xl font-bold text-foreground">{mockOutputRules.filter(r => r.enabled).length}</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-4 border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "pb-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5",
              activeTab === tab.id ? "border-cordum text-cordum" : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <tab.icon className="w-3.5 h-3.5" />
            {tab.label}
            {tab.count !== undefined && (
              <span className="text-[10px] font-mono bg-surface-2 px-1.5 py-0.5 rounded">{tab.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Quarantine Tab */}
      {activeTab === "quarantine" && (
        <>
          {/* Filters + Bulk Actions */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 bg-surface-1 border border-border rounded-md p-0.5">
                {["all", "high", "medium", "low"].map((s) => (
                  <button
                    key={s}
                    onClick={() => setSeverityFilter(s)}
                    className={cn(
                      "px-3 py-1 text-xs font-medium rounded transition-colors capitalize",
                      severityFilter === s ? "bg-cordum/10 text-cordum" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
            {selectedItems.size > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{selectedItems.size} selected</span>
                <Button variant="outline" size="sm" onClick={handleBulkRelease}>
                  <Unlock className="w-3 h-3 mr-1" />
                  Release
                </Button>
                <Button variant="danger" size="sm" onClick={handleBulkDiscard}>
                  <XCircle className="w-3 h-3 mr-1" />
                  Discard
                </Button>
              </div>
            )}
          </div>

          {filtered.length === 0 ? (
            <EmptyState icon={<ShieldAlert className="w-8 h-8" />} title="Quarantine empty" description="No outputs flagged by safety checks" />
          ) : (
            <div className="space-y-2">
              {filtered.map((item) => {
                const isExpanded = expandedItem === item.id;
                return (
                  <div key={item.id} className="instrument-card overflow-hidden">
                    <div className="flex items-center gap-3 px-5 py-3 hover:bg-surface-1 transition-colors">
                      {/* Checkbox */}
                      <input
                        type="checkbox"
                        checked={selectedItems.has(item.id)}
                        onChange={() => toggleSelect(item.id)}
                        className="w-3.5 h-3.5 rounded border-border accent-cordum"
                      />

                      {/* Expand toggle */}
                      <button onClick={() => setExpandedItem(isExpanded ? null : item.id)} className="shrink-0">
                        {isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                      </button>

                      {/* Content */}
                      <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setExpandedItem(isExpanded ? null : item.id)}>
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="font-mono text-xs text-cordum">{item.jobId.slice(0, 12)}</span>
                          <StatusBadge variant={severityColor(item.severity) as any}>{item.severity}</StatusBadge>
                          <span className={cn(
                            "px-1.5 py-0.5 rounded font-mono text-[10px] font-semibold",
                            item.decision === "QUARANTINE" ? "bg-amber-400/10 text-amber-400" : "bg-blue-400/10 text-blue-400"
                          )}>
                            {item.decision}
                          </span>
                        </div>
                        <p className="text-xs text-foreground">{item.reason}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {item.scanner && <span className="font-mono">{item.scanner}</span>}
                          {item.scanner && " · "}
                          {formatRelativeTime(item.detectedAt)}
                        </p>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => setReleaseTarget(item)} className="p-1.5 rounded hover:bg-emerald-500/10 transition-colors" title="Release">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        </button>
                        <button onClick={() => { toast.success("Output discarded"); }} className="p-1.5 rounded hover:bg-red-500/10 transition-colors" title="Discard">
                          <XCircle className="w-3.5 h-3.5 text-red-400" />
                        </button>
                      </div>
                    </div>

                    {/* Expanded detail */}
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="border-t border-border bg-surface-0"
                        >
                          <div className="p-5 space-y-4">
                            {/* Preview */}
                            <div>
                              <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-2">Original Output</p>
                              <div className="bg-surface-1 rounded-lg border border-border p-3 font-mono text-xs text-foreground whitespace-pre-wrap">
                                {item.preview}
                              </div>
                            </div>

                            {/* Redacted preview */}
                            {item.redacted_preview && (
                              <div>
                                <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-2">Redacted Output</p>
                                <div className="bg-surface-1 rounded-lg border border-blue-400/20 p-3 font-mono text-xs text-foreground whitespace-pre-wrap">
                                  {item.redacted_preview}
                                </div>
                              </div>
                            )}

                            {/* Findings */}
                            {item.findings && item.findings.length > 0 && (
                              <div>
                                <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-2">Findings ({item.findings.length})</p>
                                <div className="space-y-2">
                                  {item.findings.map((finding, idx) => (
                                    <div key={idx} className="rounded-lg border border-border bg-surface-1 p-3">
                                      <div className="flex items-center gap-2 mb-1">
                                        <StatusBadge variant={severityColor(finding.severity) as any}>{finding.severity}</StatusBadge>
                                        <span className="font-mono text-xs text-foreground font-medium">{finding.type}</span>
                                        {finding.scanner && <span className="text-[10px] text-muted-foreground font-mono">{finding.scanner}</span>}
                                      </div>
                                      <p className="text-xs text-muted-foreground">{finding.detail}</p>
                                      <div className="flex items-center gap-4 mt-2 text-[10px] font-mono text-muted-foreground">
                                        {finding.confidence !== undefined && <span>Confidence: {(finding.confidence * 100).toFixed(0)}%</span>}
                                        {finding.matched_pattern && <span>Pattern: {finding.matched_pattern}</span>}
                                        {finding.offset !== undefined && <span>Offset: {finding.offset}</span>}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Matched rule */}
                            {item.rule_id && (
                              <div className="flex items-center gap-2 text-xs">
                                <Shield className="w-3 h-3 text-cordum" />
                                <span className="text-muted-foreground">Matched rule:</span>
                                <span className="font-mono text-cordum">{item.rule_id}</span>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Output Rules Tab */}
      {activeTab === "rules" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Rules that govern how output findings are handled</p>
            <Button variant="primary" size="sm" onClick={() => toast.info("Feature coming soon")}>
              <Shield className="w-3 h-3 mr-1" />
              Add Rule
            </Button>
          </div>
          {mockOutputRules.map((rule) => (
            <div key={rule.id} className="instrument-card p-4 flex items-center gap-4">
              <div className={cn(
                "w-2 h-2 rounded-full shrink-0",
                rule.enabled ? "bg-emerald-400" : "bg-gray-500"
              )} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-mono text-sm text-foreground font-medium">{rule.id}</span>
                  <span className={cn(
                    "px-1.5 py-0.5 rounded font-mono text-[10px] font-semibold",
                    rule.decision === "QUARANTINE" ? "bg-amber-400/10 text-amber-400" : "bg-blue-400/10 text-blue-400"
                  )}>
                    {rule.decision}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">{rule.reason}</p>
                <div className="flex items-center gap-2 mt-1">
                  {Object.entries(rule.match).map(([k, v]) => (
                    <span key={k} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-surface-2 text-muted-foreground">
                      {k}={String(v)}
                    </span>
                  ))}
                </div>
              </div>
              <button
                onClick={() => toast.info("Feature coming soon")}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Edit
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Settings Tab */}
      {activeTab === "settings" && (
        <div className="space-y-4">
          <div className="instrument-card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Sensitive Data Detection</p>
                <p className="text-xs text-muted-foreground">Scan outputs for PII, credentials, and sensitive data</p>
              </div>
              <button onClick={() => setSensitiveDataEnabled(!sensitiveDataEnabled)}
                className={cn("w-9 h-5 rounded-full relative transition-colors", sensitiveDataEnabled ? "bg-cordum" : "bg-surface-2")}>
                <div className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform", sensitiveDataEnabled ? "left-[18px]" : "left-0.5")} />
              </button>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Auto-Quarantine</p>
                <p className="text-xs text-muted-foreground">Automatically quarantine flagged outputs instead of blocking</p>
              </div>
              <button onClick={() => setAutoQuarantine(!autoQuarantine)}
                className={cn("w-9 h-5 rounded-full relative transition-colors", autoQuarantine ? "bg-cordum" : "bg-surface-2")}>
                <div className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform", autoQuarantine ? "left-[18px]" : "left-0.5")} />
              </button>
            </div>
          </div>
          <Button variant="primary" size="sm" onClick={() => toast.success("Settings saved")}>
            <Save className="w-3 h-3 mr-1" />Save Settings
          </Button>
        </div>
      )}

      {/* Release Confirmation */}
      <ConfirmDialog
        open={!!releaseTarget}
        onClose={() => setReleaseTarget(null)}
        onConfirm={() => { toast.success("Output released"); setReleaseTarget(null); }}
        title="Release Output"
        description="This will release the quarantined output and deliver it to the requesting agent. Are you sure?"
        confirmLabel="Release"
        variant="default"
      />
    </motion.div>
  );
}
