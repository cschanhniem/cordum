/*
 * DESIGN: "Control Surface" — Workflow Run Detail
 * PRD Section 13: Real-time workflow run view with animated graph + chat
 */
import { useState, useRef, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  ArrowLeft, Send, Briefcase, Shield, GitBranch, Clock,
  CheckCircle2, XCircle, Loader2, MessageSquare, AlertTriangle,
  ChevronDown, Copy, RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface ChatMessage {
  id: string;
  role: "user" | "system" | "agent";
  content: string;
  timestamp: string;
}

interface RunStep {
  id: string;
  label: string;
  type: "worker" | "approval" | "condition" | "delay";
  status: "succeeded" | "running" | "failed" | "pending" | "skipped";
  duration?: string;
  output?: string;
}

const MOCK_STEPS: RunStep[] = [
  { id: "s1", label: "Input Validation", type: "worker", status: "succeeded", duration: "1.2s", output: '{"validated": true, "records": 1247, "schema": "v2.1"}' },
  { id: "s2", label: "Safety Check", type: "approval", status: "succeeded", duration: "34s", output: '{"decision": "approved", "actor": "admin@cordum.io"}' },
  { id: "s3", label: "Risk Assessment", type: "condition", status: "succeeded", duration: "0.3s", output: '{"branch": "low_risk", "score": 0.12}' },
  { id: "s4", label: "Process Data", type: "worker", status: "running", duration: "12s..." },
  { id: "s5", label: "Notify Slack", type: "worker", status: "pending" },
  { id: "s6", label: "Archive Result", type: "worker", status: "pending" },
];

export default function WorkflowRunDetailPage() {
  const { workflowId, runId } = useParams();
  const navigate = useNavigate();
  const [chatInput, setChatInput] = useState("");
  const [selectedStep, setSelectedStep] = useState<RunStep | null>(MOCK_STEPS[3]);
  const [cancelOpen, setCancelOpen] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: "1", role: "system", content: "Workflow run started. Processing step 1: Input Validation...", timestamp: "2m ago" },
    { id: "2", role: "system", content: "Step 1 completed in 1.2s. 1,247 records validated against schema v2.1.", timestamp: "2m ago" },
    { id: "3", role: "system", content: "Step 2: Safety Check — awaiting human approval.", timestamp: "1m 30s ago" },
    { id: "4", role: "agent", content: "Approval granted by admin@cordum.io. Proceeding to risk assessment.", timestamp: "1m ago" },
    { id: "5", role: "system", content: "Step 3: Risk Assessment — score 0.12 (low risk). Taking low_risk branch.", timestamp: "50s ago" },
    { id: "6", role: "system", content: "Step 4: Process Data — currently running...", timestamp: "30s ago" },
  ]);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = useCallback(() => {
    if (!chatInput.trim()) return;
    const userMsg: ChatMessage = {
      id: String(Date.now()),
      role: "user",
      content: chatInput,
      timestamp: "now",
    };
    setMessages(prev => [...prev, userMsg]);
    setChatInput("");

    // Simulate agent response
    setTimeout(() => {
      setMessages(prev => [...prev, {
        id: String(Date.now() + 1),
        role: "agent",
        content: "Acknowledged. Step 4 is currently processing 1,247 records through the data pipeline. Estimated completion: ~18s remaining.",
        timestamp: "now",
      }]);
    }, 1200);
  }, [chatInput]);

  const stepIcon = (type: string) => {
    switch (type) {
      case "worker": return Briefcase;
      case "approval": return Shield;
      case "condition": return GitBranch;
      default: return Clock;
    }
  };

  const stepStatusIcon = (status: string) => {
    switch (status) {
      case "succeeded": return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
      case "running": return <Loader2 className="w-4 h-4 text-cordum animate-spin" />;
      case "failed": return <XCircle className="w-4 h-4 text-red-400" />;
      case "skipped": return <ChevronDown className="w-4 h-4 text-muted-foreground" />;
      default: return <div className="w-4 h-4 rounded-full border-2 border-border" />;
    }
  };

  const completedCount = MOCK_STEPS.filter(s => s.status === "succeeded").length;
  const totalSteps = MOCK_STEPS.length;

  return (
    <div className="h-[calc(100vh-64px)] flex flex-col -m-6">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-surface-0 shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(`/workflows/${workflowId}`)} className="p-1.5 rounded-md hover:bg-surface-2 transition-colors">
            <ArrowLeft className="w-4 h-4 text-muted-foreground" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-display font-semibold text-foreground">Run {runId?.slice(0, 8)}</span>
              <StatusBadge variant="healthy" dot pulse>Running</StatusBadge>
              <span className="text-xs font-mono text-muted-foreground">{completedCount}/{totalSteps} steps</span>
            </div>
            <p className="text-xs text-muted-foreground font-mono">Workflow: {workflowId}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => toast.info("Feature coming soon")}>
            <RotateCcw className="w-3 h-3 mr-1" />
            Retry
          </Button>
          <Button variant="danger" size="sm" onClick={() => setCancelOpen(true)}>
            <XCircle className="w-3 h-3 mr-1" />
            Cancel Run
          </Button>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="h-1 bg-surface-1 shrink-0">
        <motion.div
          className="h-full bg-cordum"
          initial={{ width: 0 }}
          animate={{ width: `${(completedCount / totalSteps) * 100}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        />
      </div>

      {/* Split Layout: Steps + Chat */}
      <div className="flex flex-1 overflow-hidden">
        {/* Steps Panel — Animated Graph */}
        <div className="w-80 border-r border-border bg-surface-0 overflow-y-auto shrink-0">
          <div className="p-4">
            <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-3">
              Execution Graph ({completedCount}/{totalSteps})
            </p>
            <div className="relative">
              {/* Vertical connector line */}
              <div className="absolute left-[17px] top-0 bottom-0 w-px bg-border" />

              <div className="space-y-0.5">
                {MOCK_STEPS.map((step, i) => {
                  const Icon = stepIcon(step.type);
                  const isActive = step.status === "running";
                  const isCompleted = step.status === "succeeded";
                  return (
                    <motion.div
                      key={step.id}
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.08 }}
                      onClick={() => setSelectedStep(step)}
                      className={cn(
                        "relative flex items-center gap-3 px-3 py-3 rounded-md transition-colors cursor-pointer",
                        isActive ? "bg-cordum/5 border border-cordum/20" : "hover:bg-surface-1",
                        selectedStep?.id === step.id && !isActive && "bg-surface-1 border border-border",
                        step.status === "pending" && "opacity-50",
                      )}
                    >
                      <div className="relative z-10">
                        {stepStatusIcon(step.status)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className={cn("text-xs font-medium", step.status === "pending" ? "text-muted-foreground" : "text-foreground")}>{step.label}</p>
                          <Icon className="w-3 h-3 text-muted-foreground" />
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-muted-foreground capitalize">{step.type}</span>
                          {step.duration && (
                            <span className={cn("text-[10px] font-mono", isActive ? "text-cordum" : "text-muted-foreground")}>
                              {step.duration}
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="text-[10px] font-mono text-muted-foreground">{i + 1}</span>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Selected Step Output */}
          <AnimatePresence mode="wait">
            {selectedStep && (
              <motion.div
                key={selectedStep.id}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="border-t border-border overflow-hidden"
              >
                <div className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Step Output</p>
                    {selectedStep.output && (
                      <button
                        onClick={() => { navigator.clipboard.writeText(selectedStep.output!); toast.success("Copied"); }}
                        className="p-1 rounded hover:bg-surface-2 transition-colors"
                      >
                        <Copy className="w-3 h-3 text-muted-foreground" />
                      </button>
                    )}
                  </div>
                  {selectedStep.output ? (
                    <div className="rounded-md bg-surface-1 border border-border p-3 font-mono text-xs text-foreground max-h-48 overflow-auto">
                      <pre>{JSON.stringify(JSON.parse(selectedStep.output), null, 2)}</pre>
                    </div>
                  ) : selectedStep.status === "running" ? (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="w-3 h-3 animate-spin text-cordum" />
                      Processing...
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">Waiting to execute</p>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Chat Panel */}
        <div className="flex-1 flex flex-col">
          <div className="flex items-center gap-2 px-5 py-3 border-b border-border bg-surface-0">
            <MessageSquare className="w-4 h-4 text-cordum" />
            <span className="text-sm font-display font-semibold text-foreground">Run Chat</span>
            <span className="text-[10px] font-mono text-muted-foreground ml-auto">{messages.length} messages</span>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-5 space-y-3">
            {messages.map((msg, i) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className={cn(
                  "max-w-[80%] rounded-lg p-3",
                  msg.role === "user" ? "ml-auto bg-cordum/10 border border-cordum/20" :
                  msg.role === "agent" ? "bg-blue-500/10 border border-blue-500/20" :
                  "bg-surface-1 border border-border",
                )}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className={cn(
                    "text-[10px] font-mono uppercase",
                    msg.role === "user" ? "text-cordum" :
                    msg.role === "agent" ? "text-blue-400" :
                    "text-muted-foreground",
                  )}>
                    {msg.role}
                  </span>
                  <span className="text-[10px] text-muted-foreground">{msg.timestamp}</span>
                </div>
                <p className="text-sm text-foreground leading-relaxed">{msg.content}</p>
              </motion.div>
            ))}
            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          <div className="p-4 border-t border-border bg-surface-0">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                placeholder="Send a message to the workflow..."
                className="flex-1 h-9 px-3 text-sm bg-surface-1 border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-cordum"
              />
              <Button variant="primary" size="sm" onClick={sendMessage} disabled={!chatInput.trim()}>
                <Send className="w-3.5 h-3.5" />
              </Button>
            </div>
            <p className="text-[9px] text-muted-foreground mt-1.5">Press Enter to send. Messages are visible to all participants.</p>
          </div>
        </div>
      </div>

      {/* Cancel Confirmation */}
      <ConfirmDialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        onConfirm={() => { setCancelOpen(false); toast.success("Run cancelled"); navigate(`/workflows/${workflowId}`); }}
        title="Cancel Workflow Run"
        description="This will terminate the currently running step and mark all pending steps as skipped. This action cannot be undone."
        confirmLabel="Cancel Run"
        variant="destructive"
      />
    </div>
  );
}
