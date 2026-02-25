/*
 * DESIGN: "Control Surface" — Settings: System Config
 * PRD Section 26: System-wide configuration
 */
import { useState } from "react";
import { motion } from "framer-motion";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Save, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const CONFIG_SECTIONS = [
  {
    title: "Job Processing",
    fields: [
      { key: "job.default_timeout", label: "Default Job Timeout", type: "number", value: "30", unit: "seconds" },
      { key: "job.max_retries", label: "Max Retries", type: "number", value: "3", unit: "" },
      { key: "job.retry_backoff", label: "Retry Backoff", type: "select", value: "exponential", options: ["linear", "exponential", "fixed"] },
      { key: "job.dlq_enabled", label: "Dead Letter Queue", type: "toggle", value: "true" },
    ],
  },
  {
    title: "Safety",
    fields: [
      { key: "safety.input_enabled", label: "Input Safety Checks", type: "toggle", value: "true" },
      { key: "safety.output_enabled", label: "Output Safety Checks", type: "toggle", value: "true" },
      { key: "safety.default_decision", label: "Default Decision", type: "select", value: "ALLOW", options: ["ALLOW", "DENY", "REQUIRE_APPROVAL"] },
      { key: "safety.max_risk_score", label: "Max Risk Score", type: "number", value: "0.8", unit: "" },
    ],
  },
  {
    title: "Approvals",
    fields: [
      { key: "approval.timeout", label: "Approval Timeout", type: "number", value: "3600", unit: "seconds" },
      { key: "approval.auto_deny_on_timeout", label: "Auto-deny on Timeout", type: "toggle", value: "true" },
      { key: "approval.require_reason", label: "Require Reason", type: "toggle", value: "false" },
    ],
  },
  {
    title: "Workers",
    fields: [
      { key: "worker.heartbeat_interval", label: "Heartbeat Interval", type: "number", value: "30", unit: "seconds" },
      { key: "worker.drain_timeout", label: "Drain Timeout", type: "number", value: "300", unit: "seconds" },
      { key: "worker.auto_scale", label: "Auto-scale Workers", type: "toggle", value: "false" },
    ],
  },
];

export default function SettingsConfigPage() {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const v: Record<string, string> = {};
    CONFIG_SECTIONS.forEach(s => s.fields.forEach(f => { v[f.key] = f.value; }));
    return v;
  });

  const updateValue = (key: string, val: string) => {
    setValues(prev => ({ ...prev, [key]: val }));
  };

  return (
    <div className="space-y-6">
      <PageHeader
        label="Settings"
        title="System Configuration"
        subtitle="Global settings for job processing, safety, and workers"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => toast.info("Reset to defaults")}><RotateCcw className="w-3 h-3 mr-1" />Reset</Button>
            <Button variant="primary" size="sm" onClick={() => toast.success("Configuration saved")}><Save className="w-3 h-3 mr-1" />Save</Button>
          </div>
        }
      />

      <div className="space-y-4">
        {CONFIG_SECTIONS.map((section, si) => (
          <motion.div key={section.title} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: si * 0.05 }} className="instrument-card p-5">
            <h3 className="font-display font-semibold text-sm text-foreground mb-4">{section.title}</h3>
            <div className="space-y-4">
              {section.fields.map(field => (
                <div key={field.key} className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-foreground">{field.label}</p>
                    <p className="text-[10px] font-mono text-muted-foreground">{field.key}</p>
                  </div>
                  {field.type === "number" && (
                    <div className="flex items-center gap-2">
                      <input type="text" value={values[field.key]} onChange={(e) => updateValue(field.key, e.target.value)} className="h-8 w-24 px-3 text-xs font-mono bg-surface-1 border border-border rounded-md text-foreground text-right focus:outline-none focus:ring-1 focus:ring-cordum" />
                      {field.unit && <span className="text-xs text-muted-foreground">{field.unit}</span>}
                    </div>
                  )}
                  {field.type === "select" && (
                    <select value={values[field.key]} onChange={(e) => updateValue(field.key, e.target.value)} className="h-8 px-3 text-xs bg-surface-1 border border-border rounded-md text-foreground focus:outline-none focus:ring-1 focus:ring-cordum">
                      {field.options?.map(o => <option key={o}>{o}</option>)}
                    </select>
                  )}
                  {field.type === "toggle" && (
                    <button
                      onClick={() => updateValue(field.key, values[field.key] === "true" ? "false" : "true")}
                      className={cn("w-10 h-5 rounded-full transition-colors relative", values[field.key] === "true" ? "bg-cordum" : "bg-surface-2")}
                    >
                      <div className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform", values[field.key] === "true" ? "left-5.5" : "left-0.5")} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
