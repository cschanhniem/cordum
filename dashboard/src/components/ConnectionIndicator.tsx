import { useState, useEffect } from "react";
import { Wifi, WifiOff } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

type ConnectionStatus = "connected" | "reconnecting" | "disconnected";

export function ConnectionIndicator() {
  const [status, setStatus] = useState<ConnectionStatus>("connected");

  // Listen for online/offline events as a proxy for real WebSocket state
  useEffect(() => {
    const goOnline = () => setStatus("connected");
    const goOffline = () => setStatus("disconnected");
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  const config = {
    connected: {
      icon: Wifi,
      label: "All Systems Nominal",
      dotClass: "bg-emerald-400 status-pulse",
      badgeClass: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
    },
    reconnecting: {
      icon: Wifi,
      label: "Reconnecting...",
      dotClass: "bg-amber-400 animate-pulse",
      badgeClass: "bg-amber-500/15 text-amber-400 border-amber-500/20",
    },
    disconnected: {
      icon: WifiOff,
      label: "Disconnected",
      dotClass: "bg-red-400",
      badgeClass: "bg-red-500/15 text-red-400 border-red-500/20",
    },
  };

  const c = config[status];

  return (
    <AnimatePresence mode="wait">
      <motion.span
        key={status}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-mono font-medium border ${c.badgeClass}`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${c.dotClass}`} />
        {c.label}
      </motion.span>
    </AnimatePresence>
  );
}
