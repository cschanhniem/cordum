/*
 * PolicyStudioLayout — shared layout for all /policies/* pages.
 * Renders section header + primary tab bar + overflow menu.
 * Child pages render inside the content area below the tabs.
 */
import { useState, useRef, useEffect, type ReactNode } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import {
  LayoutDashboard,
  ShieldCheck,
  ShieldAlert,
  Package,
  Wrench,
  FlaskConical,
  GitBranch,
  MoreHorizontal,
  BarChart3,
  History,
  Rocket,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Tab {
  id: string;
  label: string;
  path: string;
  icon: ReactNode;
}

const PRIMARY_TABS: Tab[] = [
  { id: "overview", label: "Overview", path: "/policies", icon: <LayoutDashboard className="w-3.5 h-3.5" /> },
  { id: "input", label: "Input Policy", path: "/policies/input", icon: <ShieldCheck className="w-3.5 h-3.5" /> },
  { id: "output", label: "Output Policy", path: "/policies/output", icon: <ShieldAlert className="w-3.5 h-3.5" /> },
  { id: "bundles", label: "Bundles", path: "/policies/bundles", icon: <Package className="w-3.5 h-3.5" /> },
  { id: "builder", label: "Builder", path: "/policies/builder", icon: <Wrench className="w-3.5 h-3.5" /> },
  { id: "simulator", label: "Simulator", path: "/policies/simulator", icon: <FlaskConical className="w-3.5 h-3.5" /> },
  { id: "hierarchy", label: "Hierarchy", path: "/policies/hierarchy", icon: <GitBranch className="w-3.5 h-3.5" /> },
];

const OVERFLOW_TABS: Tab[] = [
  { id: "analytics", label: "Analytics", path: "/policies/analytics", icon: <BarChart3 className="w-3.5 h-3.5" /> },
  { id: "history", label: "History", path: "/policies/history", icon: <History className="w-3.5 h-3.5" /> },
  { id: "publish", label: "Publish", path: "/policies/publish", icon: <Rocket className="w-3.5 h-3.5" /> },
];

function getActiveTab(pathname: string): string {
  // Match overflow tabs first (more specific)
  for (const tab of OVERFLOW_TABS) {
    if (pathname === tab.path || pathname.startsWith(tab.path + "/")) return tab.id;
  }
  // Match primary tabs (check longest path first)
  const sorted = [...PRIMARY_TABS].sort((a, b) => b.path.length - a.path.length);
  for (const tab of sorted) {
    if (pathname === tab.path || pathname.startsWith(tab.path + "/")) return tab.id;
  }
  return "overview";
}

interface PolicyStudioLayoutProps {
  children: ReactNode;
}

export function PolicyStudioLayout({ children }: PolicyStudioLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const activeTab = getActiveTab(location.pathname);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const overflowRef = useRef<HTMLDivElement>(null);

  // Close overflow on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (overflowRef.current && !overflowRef.current.contains(e.target as Node)) {
        setOverflowOpen(false);
      }
    }
    if (overflowOpen) {
      document.addEventListener("mousedown", handleClick);
      return () => document.removeEventListener("mousedown", handleClick);
    }
  }, [overflowOpen]);

  const isOverflowActive = OVERFLOW_TABS.some((t) => t.id === activeTab);

  return (
    <div className="space-y-0">
      {/* Section header */}
      <div className="mb-1">
        <span className="text-[10px] font-mono text-cordum uppercase tracking-widest block mb-1">
          GOVERN
        </span>
        <h1 className="font-display text-2xl font-bold text-foreground tracking-tight">
          Policy Studio
        </h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-xl">
          Define, test, and deploy safety policies for your agent fleet
        </p>
      </div>

      {/* Primary tab bar */}
      <div className="border-b border-border -mx-1">
        <div className="flex items-center gap-0.5 px-1">
          {PRIMARY_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => navigate(tab.path)}
              className={cn(
                "relative flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium transition-colors whitespace-nowrap",
                activeTab === tab.id
                  ? "text-cordum"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.icon}
              {tab.label}
              {activeTab === tab.id && (
                <motion.div
                  layoutId="policy-tab-indicator"
                  className="absolute bottom-0 left-1 right-1 h-[2px] bg-cordum rounded-full"
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
            </button>
          ))}

          {/* Overflow menu */}
          <div className="relative ml-auto" ref={overflowRef}>
            <button
              onClick={() => setOverflowOpen(!overflowOpen)}
              className={cn(
                "relative flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium transition-colors",
                isOverflowActive
                  ? "text-cordum"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <MoreHorizontal className="w-3.5 h-3.5" />
              More
              {isOverflowActive && (
                <motion.div
                  layoutId="policy-tab-indicator"
                  className="absolute bottom-0 left-1 right-1 h-[2px] bg-cordum rounded-full"
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
            </button>

            {overflowOpen && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="absolute right-0 top-full mt-1 z-50 min-w-[160px] rounded-lg border border-border bg-surface-1 shadow-xl py-1"
              >
                {OVERFLOW_TABS.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => {
                      navigate(tab.path);
                      setOverflowOpen(false);
                    }}
                    className={cn(
                      "flex items-center gap-2 w-full px-3 py-2 text-xs transition-colors",
                      activeTab === tab.id
                        ? "text-cordum bg-cordum/5"
                        : "text-muted-foreground hover:text-foreground hover:bg-surface-2",
                    )}
                  >
                    {tab.icon}
                    {tab.label}
                  </button>
                ))}
              </motion.div>
            )}
          </div>
        </div>
      </div>

      {/* Page content */}
      <div className="pt-5">
        {children}
      </div>
    </div>
  );
}
