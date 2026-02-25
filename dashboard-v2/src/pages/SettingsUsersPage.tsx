/*
 * DESIGN: "Control Surface" — Settings: Users & RBAC
 * PRD Section 32: User management and role-based access control
 */
import { useState } from "react";
import { motion } from "framer-motion";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  Users, Plus, Shield, MoreHorizontal, Mail, Key,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const USERS = [
  { id: "u1", name: "Admin User", email: "admin@cordum.io", role: "admin", status: "active", lastLogin: "2h ago" },
  { id: "u2", name: "Ops Engineer", email: "ops@cordum.io", role: "operator", status: "active", lastLogin: "1d ago" },
  { id: "u3", name: "Developer", email: "dev@cordum.io", role: "developer", status: "active", lastLogin: "3d ago" },
  { id: "u4", name: "Viewer", email: "viewer@cordum.io", role: "viewer", status: "inactive", lastLogin: "2w ago" },
];

const ROLES = [
  { name: "admin", desc: "Full access to all resources", users: 1, color: "text-red-400" },
  { name: "operator", desc: "Manage jobs, workers, approvals", users: 1, color: "text-amber-400" },
  { name: "developer", desc: "View and create workflows", users: 1, color: "text-blue-400" },
  { name: "viewer", desc: "Read-only access", users: 1, color: "text-gray-400" },
];

export default function SettingsUsersPage() {
  const [activeTab, setActiveTab] = useState("users");

  return (
    <div className="space-y-6">
      <PageHeader
        label="Settings"
        title="Users & RBAC"
        subtitle="Manage users and role-based access control"
        actions={<Button variant="primary" size="sm"><Plus className="w-3 h-3 mr-1" />Invite User</Button>}
      />

      <div className="flex items-center gap-1 bg-surface-1 border border-border rounded-md p-0.5 w-fit">
        {["users", "roles"].map(t => (
          <button key={t} onClick={() => setActiveTab(t)} className={cn("px-4 py-1.5 text-xs font-medium rounded transition-colors capitalize", activeTab === t ? "bg-cordum/10 text-cordum" : "text-muted-foreground hover:text-foreground")}>
            {t}
          </button>
        ))}
      </div>

      {activeTab === "users" && (
        <div className="instrument-card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-surface-0">
                <th className="text-left px-5 py-3 text-xs font-mono font-medium text-muted-foreground uppercase tracking-wider">User</th>
                <th className="text-left px-5 py-3 text-xs font-mono font-medium text-muted-foreground uppercase tracking-wider">Role</th>
                <th className="text-left px-5 py-3 text-xs font-mono font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="text-left px-5 py-3 text-xs font-mono font-medium text-muted-foreground uppercase tracking-wider">Last Login</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {USERS.map(u => (
                <tr key={u.id} className="border-b border-border hover:bg-surface-1 transition-colors">
                  <td className="px-5 py-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">{u.name}</p>
                      <p className="text-xs text-muted-foreground">{u.email}</p>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <StatusBadge variant={u.role === "admin" ? "danger" : u.role === "operator" ? "warning" : "info"}>{u.role}</StatusBadge>
                  </td>
                  <td className="px-5 py-3">
                    <StatusBadge variant={u.status === "active" ? "healthy" : "muted"}>{u.status}</StatusBadge>
                  </td>
                  <td className="px-5 py-3 text-sm text-muted-foreground">{u.lastLogin}</td>
                  <td className="px-5 py-3">
                    <button className="p-1 rounded hover:bg-surface-2 transition-colors" onClick={() => toast.info("Feature coming soon")}>
                      <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === "roles" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {ROLES.map((role, i) => (
            <motion.div key={role.name} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="instrument-card p-5">
              <div className="flex items-center gap-2 mb-2">
                <Shield className={cn("w-4 h-4", role.color)} />
                <span className="font-display font-semibold text-foreground capitalize">{role.name}</span>
              </div>
              <p className="text-xs text-muted-foreground mb-3">{role.desc}</p>
              <p className="text-xs text-muted-foreground">{role.users} user(s)</p>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
