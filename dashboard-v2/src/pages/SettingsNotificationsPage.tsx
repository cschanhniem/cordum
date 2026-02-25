/*
 * DESIGN: "Control Surface" — Settings: Notifications
 * PRD Section 31: Notification preferences
 */
import { useState } from "react";
import { motion } from "framer-motion";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Save } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const CHANNELS = [
  {
    name: "Email",
    events: [
      { key: "job_failed", label: "Job Failed", enabled: true },
      { key: "approval_pending", label: "Approval Pending", enabled: true },
      { key: "worker_offline", label: "Worker Offline", enabled: true },
      { key: "policy_violation", label: "Policy Violation", enabled: false },
      { key: "workflow_completed", label: "Workflow Completed", enabled: false },
    ],
  },
  {
    name: "Slack",
    events: [
      { key: "job_failed", label: "Job Failed", enabled: true },
      { key: "approval_pending", label: "Approval Pending", enabled: true },
      { key: "worker_offline", label: "Worker Offline", enabled: false },
      { key: "policy_violation", label: "Policy Violation", enabled: true },
      { key: "workflow_completed", label: "Workflow Completed", enabled: true },
    ],
  },
  {
    name: "Webhook",
    events: [
      { key: "job_failed", label: "Job Failed", enabled: true },
      { key: "approval_pending", label: "Approval Pending", enabled: false },
      { key: "worker_offline", label: "Worker Offline", enabled: true },
      { key: "policy_violation", label: "Policy Violation", enabled: true },
      { key: "workflow_completed", label: "Workflow Completed", enabled: false },
    ],
  },
];

export default function SettingsNotificationsPage() {
  const [channels, setChannels] = useState(CHANNELS);

  const toggleEvent = (channelIdx: number, eventIdx: number) => {
    setChannels(prev => {
      const next = [...prev];
      next[channelIdx] = {
        ...next[channelIdx],
        events: next[channelIdx].events.map((e, i) =>
          i === eventIdx ? { ...e, enabled: !e.enabled } : e
        ),
      };
      return next;
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        label="Settings"
        title="Notifications"
        subtitle="Configure notification channels and event subscriptions"
        actions={<Button variant="primary" size="sm" onClick={() => toast.success("Preferences saved")}><Save className="w-3 h-3 mr-1" />Save</Button>}
      />

      <div className="space-y-4">
        {channels.map((channel, ci) => (
          <motion.div key={channel.name} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: ci * 0.05 }} className="instrument-card p-5">
            <h3 className="font-display font-semibold text-sm text-foreground mb-4">{channel.name}</h3>
            <div className="space-y-3">
              {channel.events.map((event, ei) => (
                <div key={event.key} className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-foreground">{event.label}</p>
                    <p className="text-[10px] font-mono text-muted-foreground">{event.key}</p>
                  </div>
                  <button
                    onClick={() => toggleEvent(ci, ei)}
                    className={cn("w-10 h-5 rounded-full transition-colors relative", event.enabled ? "bg-cordum" : "bg-surface-2")}
                  >
                    <div className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform", event.enabled ? "left-5.5" : "left-0.5")} />
                  </button>
                </div>
              ))}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
