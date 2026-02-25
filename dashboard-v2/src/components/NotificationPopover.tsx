import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, CheckCircle2, XCircle, AlertTriangle, Info, X, Check } from "lucide-react";

interface Notification {
  id: string;
  type: "success" | "error" | "warning" | "info";
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
}

const mockNotifications: Notification[] = [
  { id: "1", type: "warning", title: "Approval Required", message: "Job job-8a2f3e requires human approval for service.restart in production", timestamp: "2m ago", read: false },
  { id: "2", type: "error", title: "Worker Offline", message: "Worker worker-prod-03 has not sent a heartbeat in 90 seconds", timestamp: "5m ago", read: false },
  { id: "3", type: "success", title: "Policy Deployed", message: "Policy 'production-restart-gate' v3 deployed successfully", timestamp: "12m ago", read: false },
  { id: "4", type: "info", title: "Workflow Completed", message: "Workflow 'data-pipeline-v2' run #47 completed in 3m 22s", timestamp: "18m ago", read: true },
  { id: "5", type: "error", title: "DLQ Item Added", message: "Job job-c4d1e2 moved to dead letter queue after 3 failed retries", timestamp: "25m ago", read: true },
  { id: "6", type: "success", title: "Job Succeeded", message: "Job job-f7a9b1 completed successfully in 1.2s", timestamp: "32m ago", read: true },
];

const iconMap = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

const colorMap = {
  success: "text-emerald-400",
  error: "text-red-400",
  warning: "text-amber-400",
  info: "text-blue-400",
};

const bgMap = {
  success: "bg-emerald-500/10",
  error: "bg-red-500/10",
  warning: "bg-amber-500/10",
  info: "bg-blue-500/10",
};

export function NotificationPopover() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState(mockNotifications);
  const ref = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter((n) => !n.read).length;

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const markAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const dismiss = (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-md hover:bg-surface-2 transition-colors"
      >
        <Bell className="w-4 h-4 text-muted-foreground" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-amber-400 border-2 border-surface-0 status-pulse" />
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-2 w-96 bg-surface-1 border border-border rounded-xl shadow-2xl overflow-hidden z-[90]"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-display font-semibold text-foreground">Notifications</h3>
                {unreadCount > 0 && (
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-cordum/20 text-cordum text-[10px] font-mono font-bold">
                    {unreadCount}
                  </span>
                )}
              </div>
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="flex items-center gap-1 text-[11px] text-cordum hover:text-cordum-bright transition-colors"
                >
                  <Check className="w-3 h-3" />
                  Mark all read
                </button>
              )}
            </div>

            {/* Notification list */}
            <div className="max-h-96 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="px-4 py-10 text-center">
                  <Bell className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No notifications</p>
                </div>
              ) : (
                notifications.map((notif) => {
                  const Icon = iconMap[notif.type];
                  return (
                    <div
                      key={notif.id}
                      className={`flex gap-3 px-4 py-3 border-b border-border/50 transition-colors hover:bg-surface-2/50 ${
                        !notif.read ? "bg-surface-2/30" : ""
                      }`}
                    >
                      <div className={`shrink-0 w-7 h-7 rounded-lg ${bgMap[notif.type]} flex items-center justify-center mt-0.5`}>
                        <Icon className={`w-3.5 h-3.5 ${colorMap[notif.type]}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-xs font-semibold text-foreground truncate">
                            {!notif.read && (
                              <span className="inline-block w-1.5 h-1.5 rounded-full bg-cordum mr-1.5 relative -top-px" />
                            )}
                            {notif.title}
                          </p>
                          <button
                            onClick={() => dismiss(notif.id)}
                            className="shrink-0 p-0.5 rounded hover:bg-surface-3 text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{notif.message}</p>
                        <p className="text-[10px] text-muted-foreground/60 font-mono mt-1">{notif.timestamp}</p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div className="px-4 py-2.5 border-t border-border">
              <button className="w-full text-center text-[11px] text-cordum hover:text-cordum-bright transition-colors font-medium">
                View all notifications
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
