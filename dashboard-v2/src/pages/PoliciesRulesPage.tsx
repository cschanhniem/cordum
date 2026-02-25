import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { get } from "@/api/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { InstrumentCard, InstrumentCardBody } from "@/components/ui/InstrumentCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { DataTable } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonTable } from "@/components/ui/Skeleton";
import { Search, Plus, Shield, ArrowLeft, ToggleLeft, ToggleRight } from "lucide-react";

interface PolicyRule {
  id: string;
  name: string;
  description?: string;
  decision: string;
  priority?: number;
  enabled?: boolean;
  conditions?: Record<string, any>;
  createdAt?: string;
  updatedAt?: string;
}

export default function PoliciesRulesPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");

  const { data: rules, isLoading } = useQuery({
    queryKey: ["policy-rules"],
    queryFn: async () => {
      const res = await get<{ items: PolicyRule[] }>("/policies/rules?limit=500");
      return res.items ?? [];
    },
  });

  const all = rules ?? [];
  const filtered = all.filter((r) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return r.name.toLowerCase().includes(q) || r.id.toLowerCase().includes(q) || (r.description ?? "").toLowerCase().includes(q);
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Policy Rules"
        subtitle={`${all.length} rule${all.length !== 1 ? "s" : ""}`}
        actions={
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate("/policies")}>
              <ArrowLeft className="w-3.5 h-3.5" /> Back
            </Button>
            <Button variant="primary" size="sm" onClick={() => navigate("/policies/rules/new")}>
              <Plus className="w-3.5 h-3.5" /> New Rule
            </Button>
          </div>
        }
      />

      <Input
        icon={<Search className="w-3.5 h-3.5" />}
        placeholder="Search rules…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />

      <InstrumentCard>
        <InstrumentCardBody className="p-0">
          {isLoading ? (
            <div className="p-5"><SkeletonTable rows={6} /></div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<Shield className="w-5 h-5" />}
              title="No rules found"
              description="Create your first policy rule"
              action={<Button variant="primary" size="sm" onClick={() => navigate("/policies/rules/new")}><Plus className="w-3.5 h-3.5" /> New Rule</Button>}
            />
          ) : (
            <DataTable
              columns={[
                {
                  key: "enabled",
                  header: "",
                  width: "40px",
                  render: (r) => r.enabled !== false
                    ? <ToggleRight className="w-4 h-4 text-cordum" />
                    : <ToggleLeft className="w-4 h-4 text-muted-foreground" />,
                },
                {
                  key: "priority",
                  header: "Priority",
                  width: "70px",
                  align: "center",
                  render: (r) => <span className="text-xs font-mono text-muted-foreground">{r.priority ?? "—"}</span>,
                },
                {
                  key: "name",
                  header: "Rule Name",
                  render: (r) => (
                    <div>
                      <p className="text-sm font-medium text-foreground">{r.name}</p>
                      {r.description && <p className="text-xs text-muted-foreground truncate max-w-[300px]">{r.description}</p>}
                    </div>
                  ),
                },
                {
                  key: "decision",
                  header: "Decision",
                  width: "100px",
                  render: (r) => (
                    <StatusBadge variant={r.decision === "allow" ? "healthy" : r.decision === "deny" ? "danger" : "warning"}>
                      {r.decision}
                    </StatusBadge>
                  ),
                },
                {
                  key: "updated",
                  header: "Updated",
                  width: "120px",
                  align: "right",
                  render: (r) => <span className="text-xs text-muted-foreground font-mono">{r.updatedAt ? new Date(r.updatedAt).toLocaleDateString() : "—"}</span>,
                },
              ]}
              data={filtered}
              keyExtractor={(r) => r.id}
              onRowClick={(r) => navigate(`/policies/rules/${r.id}`)}
            />
          )}
        </InstrumentCardBody>
      </InstrumentCard>
    </div>
  );
}
