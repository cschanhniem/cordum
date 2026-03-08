import { Suspense, lazy, useEffect, useMemo, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { AppShell } from "../components/layout/AppShell";
import { CommandPalette } from "../components/CommandPalette";
import { useLiveBus } from "../hooks/useLiveBus";
import { useUiStore } from "../state/ui";
import { useAuthConfig } from "../hooks/useAuthConfig";
import { useConfigStore } from "../state/config";

const HomePage = lazy(() => import("../pages/HomePage"));
const RunsPage = lazy(() => import("../pages/RunsPage"));
const JobsPage = lazy(() => import("../pages/JobsPage"));
const JobDetailPage = lazy(() => import("../pages/JobDetailPage"));
const RunDetailPage = lazy(() => import("../pages/RunDetailPage"));
const WorkflowsPage = lazy(() => import("../pages/WorkflowsPage"));
const WorkflowCreatePage = lazy(() => import("../pages/WorkflowCreatePage"));
const WorkflowBuilderPage = lazy(() => import("../components/workflow/WorkflowBuilder").then(m => ({ default: m.WorkflowBuilder })));
const WorkflowDetailPage = lazy(() => import("../pages/WorkflowDetailPage"));
const PacksPage = lazy(() => import("../pages/PacksPage"));
const PoolsPage = lazy(() => import("../pages/PoolsPage"));
const PolicyPage = lazy(() => import("../pages/PolicyPage"));
const SystemPage = lazy(() => import("../pages/SystemPage"));
const ContextInspectorPage = lazy(() => import("../pages/ContextInspectorPage"));
const DLQPage = lazy(() => import("../pages/DLQPage"));
const AuditLogPage = lazy(() => import("../pages/AuditLogPage"));
const ToolsPage = lazy(() => import("../pages/ToolsPage"));
const TracePage = lazy(() => import("../pages/TracePage"));
const SearchPage = lazy(() => import("../pages/SearchPage"));
const AgentsPage = lazy(() => import("../pages/AgentsPage"));
const AgentDetailPage = lazy(() => import("../pages/AgentDetailPage"));
const ApprovalsPage = lazy(() => import("../pages/ApprovalsPage"));
const SchemasPage = lazy(() => import("../pages/SchemasPage"));
const SchemaDetailPage = lazy(() => import("../pages/SchemaDetailPage"));
const SettingsHubPage = lazy(() => import("../pages/SettingsHubPage"));
const SettingsKeysPage = lazy(() => import("../pages/SettingsKeysPage"));
const SettingsUsersPage = lazy(() => import("../pages/SettingsUsersPage"));
const SettingsConfigPage = lazy(() => import("../pages/SettingsConfigPage"));
const SettingsMcpPage = lazy(() => import("../pages/SettingsMcpPage"));
const SettingsNotificationsPage = lazy(() => import("../pages/SettingsNotificationsPage"));
const SettingsHealthPage = lazy(() => import("../pages/SettingsHealthPage"));
const SettingsEnvironmentsPage = lazy(() => import("../pages/SettingsEnvironmentsPage"));
const InputRulesPage = lazy(() => import("../pages/govern/InputRulesPage"));
const OutputRulesPage = lazy(() => import("../pages/govern/OutputRulesPage"));
const TenantsPage = lazy(() => import("../pages/govern/TenantsPage"));
const TenantDetailPage = lazy(() => import("../pages/govern/TenantDetailPage"));
const BundlesPage = lazy(() => import("../pages/govern/BundlesPage"));
const BundleDetailPage = lazy(() => import("../pages/govern/BundleDetailPage"));
const SimulatorPage = lazy(() => import("../pages/govern/SimulatorPage"));
const QuarantinePage = lazy(() => import("../pages/govern/QuarantinePage"));
const InputSafetySettings = lazy(() => import("../pages/settings/InputSafetySettings"));
const OutputSafetySettings = lazy(() => import("../pages/settings/OutputSafetySettings"));
const NotFoundPage = lazy(() => import("../pages/NotFoundPage"));
const LoginPage = lazy(() => import("../pages/LoginPage"));
const AuthCallbackPage = lazy(() => import("../pages/AuthCallbackPage"));

function AuthGate({ children }: { children: ReactNode }) {
  const location = useLocation();
  const apiKey = useConfigStore((state) => state.apiKey);
  const loaded = useConfigStore((state) => state.loaded);
  const { data: authConfig, isLoading } = useAuthConfig();

  if (!loaded || isLoading) {
    return <div className="min-h-screen bg-[color:var(--surface-muted)] p-8 text-sm text-muted-foreground">Loading console...</div>;
  }
  const requiresAuth =
    !!authConfig &&
    (authConfig.password_enabled ||
      !!authConfig.user_auth_enabled ||
      authConfig.saml_enabled ||
      authConfig.oidc_enabled);
  if (requiresAuth && !apiKey) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}

function MainApp() {
  useLiveBus();
  const navigate = useNavigate();
  const setCommandOpen = useUiStore((state) => state.setCommandOpen);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setCommandOpen]);

  const actions = useMemo(
    () => [
      { id: "home", title: "Go to Home", group: "Navigation", onSelect: () => navigate("/") },
      { id: "runs", title: "Go to Runs", group: "Navigation", onSelect: () => navigate("/runs") },
      { id: "jobs", title: "Go to Jobs", group: "Navigation", onSelect: () => navigate("/jobs") },
      { id: "workflows", title: "Go to Workflows", group: "Navigation", onSelect: () => navigate("/workflows") },
      { id: "packs", title: "Go to Marketplace", group: "Navigation", onSelect: () => navigate("/packs") },
      { id: "pools", title: "Go to Worker Pools", group: "Navigation", onSelect: () => navigate("/pools") },
      { id: "policy", title: "Go to Policy Studio", group: "Navigation", onSelect: () => navigate("/policy") },
      { id: "context", title: "Go to Context Inspector", group: "Navigation", onSelect: () => navigate("/context") },
      { id: "dlq", title: "Go to DLQ", group: "Navigation", onSelect: () => navigate("/dlq") },
      { id: "audit", title: "Go to Audit Log", group: "Navigation", onSelect: () => navigate("/audit") },
      { id: "system", title: "Go to Observability Center", group: "Navigation", onSelect: () => navigate("/system") },
      { id: "tools", title: "Go to Tools", group: "Navigation", onSelect: () => navigate("/tools") },
      { id: "trace", title: "Trace Explorer", group: "Navigation", onSelect: () => navigate("/trace") },
      { id: "search", title: "Open Search", group: "Navigation", onSelect: () => navigate("/search") },
      {
        id: "start-run",
        title: "Start new run",
        description: "Pick a workflow and launch a run",
        group: "Actions",
        onSelect: () => navigate("/workflows"),
      },
      {
        id: "approvals",
        title: "Review pending approvals",
        description: "Open the approvals inbox",
        group: "Actions",
        onSelect: () => navigate("/policy"),
      },
      {
        id: "dlq-review",
        title: "Review DLQ entries",
        description: "Investigate failed jobs",
        group: "Actions",
        onSelect: () => navigate("/dlq"),
      },
      {
        id: "audit-log",
        title: "Open audit log",
        description: "Track policy publishing activity",
        group: "Actions",
        onSelect: () => navigate("/audit"),
      },
    ],
    [navigate]
  );

  return (
    <>
      <AppShell>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/runs" element={<RunsPage />} />
          <Route path="/runs/:runId" element={<RunDetailPage />} />
          <Route path="/jobs" element={<JobsPage />} />
          <Route path="/jobs/:jobId" element={<JobDetailPage />} />
          <Route path="/workflows" element={<WorkflowsPage />} />
          <Route path="/workflows/new" element={<WorkflowCreatePage />} />
          <Route path="/workflows/:id/edit" element={<WorkflowBuilderPage />} />
          <Route path="/workflows/:id" element={<WorkflowDetailPage />} />
          <Route path="/agents" element={<AgentsPage />} />
          <Route path="/agents/:agentId" element={<AgentDetailPage />} />
          <Route path="/approvals" element={<ApprovalsPage />} />
          <Route path="/packs" element={<PacksPage />} />
          <Route path="/pools" element={<PoolsPage />} />
          <Route path="/schemas" element={<SchemasPage />} />
          <Route path="/schemas/:schemaId" element={<SchemaDetailPage />} />
          <Route path="/policy" element={<PolicyPage />} />
          <Route path="/govern/input-rules" element={<InputRulesPage />} />
          <Route path="/govern/output-rules" element={<OutputRulesPage />} />
          <Route path="/govern/tenants" element={<TenantsPage />} />
          <Route path="/govern/tenants/:tenantId" element={<TenantDetailPage />} />
          <Route path="/govern/bundles" element={<BundlesPage />} />
          <Route path="/govern/bundles/:bundleId" element={<BundleDetailPage />} />
          <Route path="/govern/simulator" element={<SimulatorPage />} />
          <Route path="/govern/quarantine" element={<QuarantinePage />} />
          <Route path="/settings" element={<SettingsHubPage />} />
          <Route path="/settings/keys" element={<SettingsKeysPage />} />
          <Route path="/settings/users" element={<SettingsUsersPage />} />
          <Route path="/settings/config" element={<SettingsConfigPage />} />
          <Route path="/settings/mcp" element={<SettingsMcpPage />} />
          <Route path="/settings/notifications" element={<SettingsNotificationsPage />} />
          <Route path="/settings/health" element={<SettingsHealthPage />} />
          <Route path="/settings/environments" element={<SettingsEnvironmentsPage />} />
          <Route path="/settings/input-safety" element={<InputSafetySettings />} />
          <Route path="/settings/output-safety" element={<OutputSafetySettings />} />
          <Route path="/context" element={<ContextInspectorPage />} />
          <Route path="/dlq" element={<DLQPage />} />
          <Route path="/audit" element={<AuditLogPage />} />
          <Route path="/system" element={<SystemPage />} />
          <Route path="/tools" element={<ToolsPage />} />
          <Route path="/trace" element={<TracePage />} />
          <Route path="/trace/:id" element={<TracePage />} />
          <Route path="/traces" element={<TracePage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </AppShell>
      <CommandPalette />
    </>
  );
}

export function App() {
  return (
    <Suspense fallback={<div className="text-sm text-muted-foreground">Loading dashboard...</div>}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        <Route
          path="/*"
          element={
            <AuthGate>
              <MainApp />
            </AuthGate>
          }
        />
      </Routes>
    </Suspense>
  );
}
