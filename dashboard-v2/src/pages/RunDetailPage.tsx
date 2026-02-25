/*
 * DESIGN: "Control Surface" — Workflow Run Detail
 * PRD Section 13: Real-time workflow run view with chat
 */
import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  ArrowLeft, Send, Briefcase, Shield, GitBranch, Clock,
  CheckCircle2, XCircle, Loader2, MessageSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatMessage {
  id: string;
  role: "user" | "system" | "agent";
  content: string;
  timestamp: string;
}

const MOCK_STEPS = [
  { id: "s1", label: "Input Validation", type: "worker", status: "succeeded" },
  { id: "s2", label: "Safety Check", type: "approval", status: "succeeded" },
  { id: "s3", label: "Process Data", type: "worker", status: "running" },
  { id: "s4", label: "Notify Slack", type: "worker", status: "pending" },
  { id: "s5", label: "Archive Result", type: "worker", status: "pending" },
];

export default function WorkflowRunDetailPage() {
  const { workflowId, runId } = useParams();
  const navigate = useNavigate();
  const [chatInput, setChatInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: "1", role: "system", content: "Workflow run started. Processing step 1: Input Validation...", timestamp: "2m ago" },
    { id: "2", role: "system", content: "Step 1 completed. Moving to Safety Check.", timestamp: "1m ago" },
    { id: "3", role: "system", content: "Safety check approved by admin@cordum.io. Processing step 3...", timestamp: "30s ago" },
  ]);

  const sendMessage = () => {
    if (!chatInput.trim()) return;
    setMessages(prev => [...prev, {
      id: String(prev.length + 1),
      role: "user",
      content: chatInput,
      timestamp: "now",
    }]);
    setChatInput("");
  };

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
      default: return <div className="w-4 h-4 rounded-full border-2 border-border" />;
    }
  };

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
            </div>
            <p className="text-xs text-muted-foreground font-mono">Workflow: {workflowId}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="danger" size="sm"><XCircle className="w-3 h-3 mr-1" />Cancel Run</Button>
        </div>
      </div>

      {/* Split Layout: Steps + Chat */}
      <div className="flex flex-1 overflow-hidden">
        {/* Steps Panel */}
        <div className="w-80 border-r border-border bg-surface-0 overflow-y-auto shrink-0">
          <div className="p-4">
            <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-3">Steps (3/5)</p>
            <div className="space-y-1">
              {MOCK_STEPS.map((step, i) => {
                const Icon = stepIcon(step.type);
                return (
                  <div
                    key={step.id}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors",
                      step.status === "running" ? "bg-cordum/5 border border-cordum/20" : "hover:bg-surface-1",
                    )}
                  >
                    {stepStatusIcon(step.status)}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground">{step.label}</p>
                      <p className="text-[10px] text-muted-foreground capitalize">{step.type}</p>
                    </div>
                    <span className="text-[10px] font-mono text-muted-foreground">{i + 1}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Step Output */}
          <div className="border-t border-border p-4">
            <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-3">Step Output</p>
            <div className="rounded-md bg-surface-1 border border-border p-3 font-mono text-xs text-foreground max-h-48 overflow-auto">
              <pre>{`{
  "validated": true,
  "records": 1247,
  "schema": "v2.1"
}`}</pre>
            </div>
          </div>
        </div>

        {/* Chat Panel */}
        <div className="flex-1 flex flex-col">
          <div className="flex items-center gap-2 px-5 py-3 border-b border-border bg-surface-0">
            <MessageSquare className="w-4 h-4 text-cordum" />
            <span className="text-sm font-display font-semibold text-foreground">Run Chat</span>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-5 space-y-3">
            {messages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  "max-w-[80%] rounded-lg p-3",
                  msg.role === "user" ? "ml-auto bg-cordum/10 border border-cordum/20" :
                  msg.role === "system" ? "bg-surface-1 border border-border" :
                  "bg-blue-500/10 border border-blue-500/20",
                )}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-mono text-muted-foreground uppercase">{msg.role}</span>
                  <span className="text-[10px] text-muted-foreground">{msg.timestamp}</span>
                </div>
                <p className="text-sm text-foreground">{msg.content}</p>
              </motion.div>
            ))}
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
              <Button variant="primary" size="sm" onClick={sendMessage}>
                <Send className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
