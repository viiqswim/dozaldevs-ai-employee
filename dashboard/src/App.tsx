import { Component, type ReactNode } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Toaster } from 'sonner';
import { TenantProvider } from './hooks/use-tenant';
import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { PlatformOwnerRoute } from './components/PlatformOwnerRoute';
import { Layout } from './components/layout/Layout';
import { TaskFeed } from './panels/tasks/TaskFeed';
import { TaskDetail } from './panels/tasks/TaskDetail';
import { EmployeeList } from './panels/employees/EmployeeList';
import { EmployeeDetail } from './panels/employees/EmployeeDetail';
import { CreateEmployeePage } from './panels/employees/CreateEmployeePage';
import { EditEmployeePage } from './panels/employees/EditEmployeePage';
import { TriggerEmployeePage } from './panels/employees/TriggerEmployeePage';
import { TenantOverview } from './panels/tenants/TenantOverview';
import { IntegrationsPage } from './panels/integrations/IntegrationsPage';
import { PreflightPanel } from './panels/preflight/PreflightPanel';
import { RulesPanel } from './panels/rules/RulesPanel';
import { ToolList } from './panels/tools/ToolList';
import { ToolDetail } from './panels/tools/ToolDetail';
import { ModelCatalogPage } from './pages/ModelCatalogPage';
import { TaskLogsPage } from './pages/TaskLogsPage';
import { PlatformSettingsPage } from './pages/PlatformSettingsPage';
import { MembersPage } from './pages/MembersPage';
import { TenantManagementPage } from './pages/TenantManagementPage';
import { ComposioConnections } from './pages/ComposioConnections';
import { LoginPage } from './pages/LoginPage';
import { SignupPage } from './pages/SignupPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { AuthCallbackPage } from './pages/AuthCallbackPage';
import AcceptInvitePage from './pages/AcceptInvitePage';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, message: '' };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : String(error),
    };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen items-center justify-center p-8">
          <div className="space-y-2 text-center">
            <p className="text-lg font-semibold text-destructive">Something went wrong</p>
            <p className="text-sm text-muted-foreground">{this.state.message}</p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <TenantProvider>
            <Toaster richColors position="top-right" />
            <Routes>
              <Route path="/dashboard/login" element={<LoginPage />} />
              <Route path="/dashboard/signup" element={<SignupPage />} />
              <Route path="/dashboard/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/dashboard/auth/callback" element={<AuthCallbackPage />} />
              <Route path="/dashboard/accept-invite" element={<AcceptInvitePage />} />
              <Route
                element={
                  <ProtectedRoute>
                    <Layout onOpenApiKey={() => {}} />
                  </ProtectedRoute>
                }
              >
                <Route path="/dashboard" element={<TaskFeed />} />
                <Route path="/dashboard/tasks" element={<TaskFeed />} />
                <Route path="/dashboard/tasks/:taskId" element={<TaskDetail />} />
                <Route path="/dashboard/tasks/:taskId/logs" element={<TaskLogsPage />} />
                <Route path="/dashboard/employees" element={<EmployeeList />} />
                <Route path="/dashboard/employees/new" element={<CreateEmployeePage />} />
                <Route
                  path="/dashboard/employees/:archetypeId/edit"
                  element={<EditEmployeePage />}
                />
                <Route
                  path="/dashboard/employees/:archetypeId/trigger"
                  element={<TriggerEmployeePage />}
                />
                <Route path="/dashboard/employees/:archetypeId" element={<EmployeeDetail />} />
                <Route path="/dashboard/tenants" element={<TenantOverview />} />
                <Route path="/dashboard/integrations" element={<IntegrationsPage />} />
                <Route path="/dashboard/integrations/composio" element={<ComposioConnections />} />
                <Route path="/dashboard/rules" element={<RulesPanel />} />
                <Route path="/dashboard/members" element={<MembersPage />} />
                <Route element={<PlatformOwnerRoute />}>
                  <Route path="/dashboard/preflight" element={<PreflightPanel />} />
                  <Route path="/dashboard/tools" element={<ToolList />} />
                  <Route path="/dashboard/tools/:service/:toolName" element={<ToolDetail />} />
                  <Route path="/dashboard/models" element={<ModelCatalogPage />} />
                  <Route path="/dashboard/settings" element={<PlatformSettingsPage />} />
                  <Route path="/dashboard/admin/tenants" element={<TenantManagementPage />} />
                </Route>
              </Route>
            </Routes>
          </TenantProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
