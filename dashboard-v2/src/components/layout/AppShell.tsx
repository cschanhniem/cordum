import { NavLink, useLocation } from "react-router-dom";
import { type ReactNode, useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { useConfigStore } from "@/state/config";
import { useUiStore } from "@/state/ui";
import {
  LayoutGrid,
  ListChecks,
  Workflow,
  Cpu,
  UserCheck,
  Shield,
  Boxes,
  AlertTriangle,
  FileText,
  Settings,
  ChevronLeft,
  ChevronRight,
  Moon,
  Sun,
  LogOut,
  Search,
  Bell,
  Monitor,
  Command,
} from "lucide-react";

const navSections = [
  {
    label: "Core",
    items: [
      { path: "/", label: "Overview", icon: LayoutGrid, end: true },
      { path: "/jobs", label: "Jobs", icon: ListChecks },
      { path: "/workflows", label: "Workflows", icon: Workflow },
      { path: "/agents", label: "Agent Fleet", icon: Cpu },
    ],
  },
  {
    label: "Safety",
    items: [
      { path: "/approvals", label: "Approvals", icon: UserCheck, badge: true },
      { path: "/policies", label: "Policy Studio", icon: Shield },
    ],
  },
  {
    label: "Platform",
    items: [
      { path: "/packs", label: "Packs", icon: Boxes },
      { path: "/schemas", label: "Schemas", icon: Monitor },
      { path: "/dlq", label: "Dead Letters", icon: AlertTriangle, badge: true },
      { path: "/audit", label: "Audit Log", icon: FileText },
    ],
  },
  {
    label: "System",
    items: [{ path: "/settings", label: "Settings", icon: Settings }],
  },
];

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const theme = useUiStore((s) => s.resolvedTheme);
  const toggleTheme = useUiStore((s) => s.toggleTheme);
  const user = useConfigStore((s) => s.user);
  const logout = useConfigStore((s) => s.logout);

  // Keyboard shortcut: Cmd/Ctrl + B to toggle sidebar
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "b") {
        e.preventDefault();
        setCollapsed((c) => !c);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <aside
        className={cn(
          "flex flex-col h-full border-r border-border bg-card transition-all duration-200 ease-out",
          collapsed ? "w-[60px]" : "w-[240px]",
        )}
      >
        {/* Logo */}
        <div className="flex items-center h-14 px-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="w-7 h-7 rounded-lg bg-cordum flex items-center justify-center shrink-0">
              <span className="text-[11px] font-bold text-[#0f1518] font-display">C</span>
            </div>
            {!collapsed && (
              <motion.span
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                className="text-sm font-semibold font-display text-foreground tracking-tight whitespace-nowrap"
              >
                Cordum
              </motion.span>
            )}
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-5">
          {navSections.map((section) => (
            <div key={section.label}>
              {!collapsed && (
                <p className="px-2 mb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/60">
                  {section.label}
                </p>
              )}
              <div className="space-y-0.5">
                {section.items.map((item) => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    end={(item as any).end}
                    className={({ isActive }) =>
                      cn(
                        "flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm font-medium transition-all duration-150",
                        "hover:bg-cordum/8 hover:text-foreground",
                        isActive
                          ? "bg-cordum/12 text-cordum"
                          : "text-muted-foreground",
                        collapsed && "justify-center px-0",
                      )
                    }
                  >
                    <item.icon className="w-4 h-4 shrink-0" />
                    {!collapsed && (
                      <span className="truncate">{item.label}</span>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Sidebar footer */}
        <div className="border-t border-border p-2 space-y-1 shrink-0">
          <button
            onClick={toggleTheme}
            className={cn(
              "flex items-center gap-2.5 w-full px-2.5 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-cordum/8 transition-colors",
              collapsed && "justify-center px-0",
            )}
          >
            {theme === "dark" ? (
              <Sun className="w-4 h-4 shrink-0" />
            ) : (
              <Moon className="w-4 h-4 shrink-0" />
            )}
            {!collapsed && <span>Toggle theme</span>}
          </button>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className={cn(
              "flex items-center gap-2.5 w-full px-2.5 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-cordum/8 transition-colors",
              collapsed && "justify-center px-0",
            )}
          >
            {collapsed ? (
              <ChevronRight className="w-4 h-4 shrink-0" />
            ) : (
              <ChevronLeft className="w-4 h-4 shrink-0" />
            )}
            {!collapsed && <span>Collapse</span>}
          </button>
        </div>
      </aside>

      {/* Main content area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex items-center justify-between h-14 px-6 border-b border-border bg-card/50 backdrop-blur-sm shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-surface-2/50 border border-border text-muted-foreground text-sm min-w-[240px]">
              <Search className="w-3.5 h-3.5" />
              <span className="text-xs">Search…</span>
              <kbd className="ml-auto text-[10px] font-mono px-1.5 py-0.5 rounded bg-background border border-border">
                <Command className="w-2.5 h-2.5 inline" />K
              </kbd>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button className="relative p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-cordum/8 transition-colors">
              <Bell className="w-4 h-4" />
            </button>
            {user && (
              <div className="flex items-center gap-2 pl-3 border-l border-border">
                <div className="w-7 h-7 rounded-full bg-cordum/20 flex items-center justify-center">
                  <span className="text-xs font-semibold text-cordum">
                    {(user.display_name || user.username || "U").charAt(0).toUpperCase()}
                  </span>
                </div>
                {!collapsed && (
                  <div className="text-xs">
                    <p className="font-medium text-foreground">{user.display_name || user.username}</p>
                    <p className="text-muted-foreground">{user.roles?.[0] || "user"}</p>
                  </div>
                )}
                <button
                  onClick={logout}
                  className="p-1.5 rounded-md text-muted-foreground hover:text-status-danger transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <div className="p-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
