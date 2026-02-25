/*
 * DESIGN: "Control Surface" — Policy History
 * PRD Section 20: Audit trail of policy changes
 */
import { motion } from "framer-motion";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  Plus, Edit3, Rocket, Pause, Trash2, FlaskConical,
} from "lucide-react";
import { cn } from "@/lib/utils";

const EVENTS = [
  { id: "1", type: "deployed", icon: Rocket, color: "bg-cordum", rule: "block-prod-writes", actor: "admin@cordum.io", summary: "Deployed to production", time: "2 hours ago" },
  { id: "2", type: "modified", icon: Edit3, color: "bg-blue-400", rule: "require-approval-deploy", actor: "ops@cordum.io", summary: "Changed decision from ALLOW to REQUIRE_APPROVAL", time: "5 hours ago" },
  { id: "3", type: "simulation", icon: FlaskConical, color: "bg-blue-400", rule: "block-prod-writes", actor: "admin@cordum.io", summary: "Ran simulation with 500 historical jobs", time: "6 hours ago" },
  { id: "4", type: "created", icon: Plus, color: "bg-cordum", rule: "throttle-batch-jobs", actor: "admin@cordum.io", summary: "Created new rule", time: "1 day ago" },
  { id: "5", type: "disabled", icon: Pause, color: "bg-amber-400", rule: "legacy-allow-all", actor: "ops@cordum.io", summary: "Disabled rule", time: "2 days ago" },
  { id: "6", type: "deleted", icon: Trash2, color: "bg-red-400", rule: "temp-debug-rule", actor: "admin@cordum.io", summary: "Deleted rule", time: "3 days ago" },
];

export default function PolicyHistoryPage() {
  return (
    <div className="space-y-6">
      <PageHeader label="Govern" title="Policy History" subtitle="Audit trail of all policy changes" />

      <div className="instrument-card p-5">
        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-[19px] top-0 bottom-0 w-[2px] bg-border" />

          <div className="space-y-6">
            {EVENTS.map((event, i) => {
              const Icon = event.icon;
              return (
                <motion.div
                  key={event.id}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="relative flex gap-4 pl-12"
                >
                  {/* Dot */}
                  <div className={cn("absolute left-2.5 top-1 w-5 h-5 rounded-full flex items-center justify-center", event.color)}>
                    <Icon className="w-3 h-3 text-[#0f1518]" />
                  </div>

                  <div className="flex-1 rounded-lg bg-surface-1 border border-border p-4">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm text-cordum">{event.rule}</span>
                        <StatusBadge variant={
                          event.type === "deployed" ? "healthy" :
                          event.type === "deleted" ? "danger" :
                          event.type === "disabled" ? "warning" :
                          "info"
                        }>
                          {event.type}
                        </StatusBadge>
                      </div>
                      <span className="text-xs text-muted-foreground">{event.time}</span>
                    </div>
                    <p className="text-sm text-foreground">{event.summary}</p>
                    <p className="text-xs text-muted-foreground mt-1">by {event.actor}</p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
