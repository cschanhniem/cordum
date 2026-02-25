/*
 * DESIGN: "Control Surface" — Trace Browser
 * OBSERVE / Traces
 * Distributed execution visualization: waterfall, spans, cross-service timing
 */
import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import {
  Search, Activity, Clock, ChevronDown, ChevronRight,
  AlertTriangle, Shield, Cpu, Zap, ArrowRight, RefreshCw,
  Filter, ExternalLink,
} from "lucide-react";
import { cn, formatRelativeTime } from "@/lib/utils";
import { toast } from "sonner";

/* Mock trace data — in production from GET /api/v1/traces/{traceId} */
interface Span {
  span_id: string;
  parent_span_id?: string;
  operation: string;
  service: string;
  start_ms: number; // offset from trace start
  duration_ms: number;
  status: "ok" | "error" | "timeout";
  safety_decision?: string;
  error_message?: string;
  attributes?: Record<string, string>;
}

interface TraceEntry {
  trace_id: string;
  job_id: string;
  agent_id?: string;
  total_duration_ms: number;
  service_count: number;
  span_count: number;
  status: "ok" | "error" | "timeout";
  started_at: string;
  safety_decision?: string;
  topic?: string;
}

const mockTraces: TraceEntry[] = [
  { trace_id: "tr-a1b2c3d4e5f6", job_id: "job-001", agent_id: "agent-alpha", total_duration_ms: 1240, service_count: 4, span_count: 7, status: "ok", started_at: new Date(Date.now() - 60000).toISOString(), safety_decision: "allow", topic: "code-review" },
  { trace_id: "tr-f6e5d4c3b2a1", job_id: "job-002", agent_id: "agent-beta", total_duration_ms: 3420, service_count: 5, span_count: 12, status: "error", started_at: new Date(Date.now() - 180000).toISOString(), safety_decision: "allow_with_constraints", topic: "data-analysis" },
  { trace_id: "tr-112233445566", job_id: "job-003", agent_id: "agent-gamma", total_duration_ms: 890, service_count: 3, span_count: 5, status: "ok", started_at: new Date(Date.now() - 300000).toISOString(), safety_decision: "deny", topic: "external-api-call" },
  { trace_id: "tr-aabbccddeeff", job_id: "job-004", total_duration_ms: 5600, service_count: 5, span_count: 15, status: "timeout", started_at: new Date(Date.now() - 600000).toISOString(), safety_decision: "require_approval", topic: "financial-report" },
  { trace_id: "tr-998877665544", job_id: "job-005", agent_id: "agent-alpha", total_duration_ms: 450, service_count: 3, span_count: 4, status: "ok", started_at: new Date(Date.now() - 900000).toISOString(), safety_decision: "allow", topic: "summarize" },
];

const mockSpans: Span[] = [
  { span_id: "s1", operation: "job.submit", service: "API Gateway", start_ms: 0, duration_ms: 12, status: "ok" },
  { span_id: "s2", parent_span_id: "s1", operation: "safety.evaluate", service: "Safety Kernel", start_ms: 12, duration_ms: 8, status: "ok", safety_decision: "allow", attributes: { "policy.version": "v4", "matched_rules": "2" } },
  { span_id: "s3", parent_span_id: "s1", operation: "job.schedule", service: "Scheduler", start_ms: 20, duration_ms: 3, status: "ok" },
  { span_id: "s4", parent_span_id: "s3", operation: "nats.publish", service: "Message Bus", start_ms: 23, duration_ms: 1, status: "ok" },
  { span_id: "s5", parent_span_id: "s4", operation: "job.dispatch", service: "Worker Pool", start_ms: 24, duration_ms: 5, status: "ok" },
  { span_id: "s6", parent_span_id: "s5", operation: "job.execute", service: "Worker", start_ms: 29, duration_ms: 1180, status: "ok" },
  { span_id: "s7", parent_span_id: "s6", operation: "result.store", service: "API Gateway", start_ms: 1209, duration_ms: 31, status: "ok" },
];

const serviceColors: Record<string, string> = {
  "API Gateway": "bg-blue-400",
  "Safety Kernel": "bg-cordum",
  "Scheduler": "bg-purple-400",
  "Message Bus": "bg-orange-400",
  "Worker Pool": "bg-cyan-400",
  "Worker": "bg-emerald-400",
};

function SafetyBadge({ decision }: { decision?: string }) {
  const config: Record<string, { color: string; bg: string }> = {
    allow: { color: "text-emerald-400", bg: "bg-emerald-400/10" },
    deny: { color: "text-red-400", bg: "bg-red-400/10" },
    require_approval: { color: "text-amber-400", bg: "bg-amber-400/10" },
    allow_with_constraints: { color: "text-blue-400", bg: "bg-blue-400/10" },
    throttle: { color: "text-orange-400", bg: "bg-orange-400/10" },
  };
  const c = config[decision ?? ""] ?? { color: "text-muted-foreground", bg: "bg-surface-2" };
  return (
    <span className={cn("px-1.5 py-0.5 rounded font-mono text-[10px] font-semibold", c.color, c.bg)}>
      {(decision ?? "—").toUpperCase().replace(/_/g, " ")}
    </span>
  );
}

export default function TracesPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [selectedTrace, setSelectedTrace] = useState<string | null>(null);
  const [selectedSpan, setSelectedSpan] = useState<string | null>(null);

  const filteredTraces = useMemo(() => {
    if (!search) return mockTraces;
    const q = search.toLowerCase();
    return mockTraces.filter(t =>
      t.trace_id.toLowerCase().includes(q) ||
      t.job_id.toLowerCase().includes(q) ||
      (t.agent_id ?? "").toLowerCase().includes(q) ||
      (t.topic ?? "").toLowerCase().includes(q)
    );
  }, [search]);

  const activeTrace = selectedTrace ? mockTraces.find(t => t.trace_id === selectedTrace) : null;
  const maxDuration = activeTrace?.total_duration_ms ?? 1240;

  return (
    <div className="space-y-6">
      <PageHeader
        label="Observe"
        title="Trace Browser"
        subtitle="Distributed execution visualization across services"
        actions={
          <Button variant="outline" size="sm" onClick={() => toast.info("Feature coming soon")}>
            <RefreshCw className="w-3 h-3 mr-1" />
            Refresh
          </Button>
        }
      />

      {/* Search */}
      <div className="relative max-w-lg">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search by trace ID, job ID, agent ID, or topic..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 w-full pl-8 pr-3 text-xs bg-surface-1 border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-cordum"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Trace List */}
        <div className="space-y-2">
          <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest px-1">Recent Traces</p>
          {filteredTraces.map((trace) => (
            <div
              key={trace.trace_id}
              onClick={() => { setSelectedTrace(trace.trace_id); setSelectedSpan(null); }}
              className={cn(
                "instrument-card p-3 cursor-pointer transition-all",
                selectedTrace === trace.trace_id ? "ring-1 ring-cordum border-cordum/30" : "hover:bg-surface-1"
              )}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-mono text-xs text-cordum">{trace.trace_id.slice(0, 16)}</span>
                <StatusBadge variant={trace.status === "ok" ? "healthy" : trace.status === "error" ? "danger" : "warning"}>
                  {trace.status}
                </StatusBadge>
              </div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs text-foreground">{trace.topic || "—"}</span>
                <SafetyBadge decision={trace.safety_decision} />
              </div>
              <div className="flex items-center gap-3 text-[10px] font-mono text-muted-foreground">
                <span>{trace.total_duration_ms}ms</span>
                <span>{trace.span_count} spans</span>
                <span>{trace.service_count} services</span>
                <span>{formatRelativeTime(trace.started_at)}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Waterfall View */}
        <div className="lg:col-span-2">
          {activeTrace ? (
            <div className="instrument-card overflow-hidden">
              <div className="px-5 py-3 border-b border-border flex items-center justify-between">
                <div>
                  <h3 className="font-display font-semibold text-sm text-foreground">Waterfall</h3>
                  <p className="text-xs text-muted-foreground font-mono">{activeTrace.trace_id} · {activeTrace.total_duration_ms}ms total</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={() => navigate(`/jobs/${activeTrace.job_id}`)}>
                    <ExternalLink className="w-3 h-3 mr-1" />
                    Job Detail
                  </Button>
                </div>
              </div>

              {/* Service legend */}
              <div className="px-5 py-2 border-b border-border flex items-center gap-4 flex-wrap">
                {Object.entries(serviceColors).map(([service, color]) => (
                  <span key={service} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <span className={cn("w-2 h-2 rounded-sm", color)} />
                    {service}
                  </span>
                ))}
              </div>

              {/* Timeline header */}
              <div className="px-5 py-1.5 border-b border-border flex items-center">
                <div className="w-40 shrink-0 text-[10px] font-mono text-muted-foreground">Operation</div>
                <div className="flex-1 relative h-4">
                  {[0, 0.25, 0.5, 0.75, 1].map((pct) => (
                    <span
                      key={pct}
                      className="absolute top-0 text-[9px] font-mono text-muted-foreground/50 -translate-x-1/2"
                      style={{ left: `${pct * 100}%` }}
                    >
                      {Math.round(maxDuration * pct)}ms
                    </span>
                  ))}
                </div>
              </div>

              {/* Spans */}
              <div className="divide-y divide-border/50">
                {mockSpans.map((span) => {
                  const leftPct = (span.start_ms / maxDuration) * 100;
                  const widthPct = Math.max((span.duration_ms / maxDuration) * 100, 0.5);
                  const isSelected = selectedSpan === span.span_id;
                  const barColor = serviceColors[span.service] ?? "bg-gray-400";

                  return (
                    <div key={span.span_id}>
                      <div
                        className={cn(
                          "flex items-center px-5 py-2 cursor-pointer transition-colors",
                          isSelected ? "bg-surface-1" : "hover:bg-surface-0"
                        )}
                        onClick={() => setSelectedSpan(isSelected ? null : span.span_id)}
                      >
                        <div className="w-40 shrink-0 flex items-center gap-2">
                          {span.parent_span_id && <span className="w-3 border-l border-b border-border/50 h-3 ml-1" />}
                          <div className="min-w-0">
                            <p className="text-xs text-foreground truncate">{span.operation}</p>
                            <p className="text-[10px] text-muted-foreground">{span.service}</p>
                          </div>
                        </div>
                        <div className="flex-1 relative h-6 flex items-center">
                          <div
                            className={cn("h-4 rounded-sm relative", barColor, span.status === "error" && "opacity-70")}
                            style={{ marginLeft: `${leftPct}%`, width: `${widthPct}%`, minWidth: "4px" }}
                          >
                            {span.safety_decision && (
                              <div className="absolute -top-1 -right-1">
                                <Shield className="w-3 h-3 text-cordum" />
                              </div>
                            )}
                          </div>
                          <span className="ml-2 text-[10px] font-mono text-muted-foreground">{span.duration_ms}ms</span>
                        </div>
                      </div>

                      {/* Span detail */}
                      <AnimatePresence>
                        {isSelected && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="bg-surface-0 border-t border-border/50"
                          >
                            <div className="px-5 py-3 grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                              <div>
                                <p className="text-muted-foreground mb-0.5">Span ID</p>
                                <p className="font-mono text-foreground">{span.span_id}</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground mb-0.5">Service</p>
                                <p className="text-foreground">{span.service}</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground mb-0.5">Duration</p>
                                <p className="font-mono text-foreground">{span.duration_ms}ms</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground mb-0.5">Status</p>
                                <StatusBadge variant={span.status === "ok" ? "healthy" : "danger"}>{span.status}</StatusBadge>
                              </div>
                              {span.safety_decision && (
                                <div>
                                  <p className="text-muted-foreground mb-0.5">Safety Decision</p>
                                  <SafetyBadge decision={span.safety_decision} />
                                </div>
                              )}
                              {span.attributes && Object.entries(span.attributes).map(([k, v]) => (
                                <div key={k}>
                                  <p className="text-muted-foreground mb-0.5">{k}</p>
                                  <p className="font-mono text-foreground">{v}</p>
                                </div>
                              ))}
                              {span.error_message && (
                                <div className="col-span-full">
                                  <p className="text-muted-foreground mb-0.5">Error</p>
                                  <p className="font-mono text-red-400 text-xs">{span.error_message}</p>
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
            </div>
          ) : (
            <div className="instrument-card p-12 text-center">
              <Activity className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-foreground font-medium">Select a trace</p>
              <p className="text-xs text-muted-foreground mt-1">Click a trace from the list to view its waterfall</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
