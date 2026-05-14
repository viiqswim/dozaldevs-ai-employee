import { Component, type ReactNode, useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Toaster } from 'sonner';
import { TenantProvider } from './hooks/use-tenant';
import { Layout } from './components/layout/Layout';
import { ApiKeyPrompt } from './components/ApiKeyPrompt';
import { TaskFeed } from './panels/tasks/TaskFeed';
import { TaskDetail } from './panels/tasks/TaskDetail';

function TriggerPlaceholder() {
  return <div className="p-6">Trigger Panel — coming soon</div>;
}

function TenantsPlaceholder() {
  return <div className="p-6">Tenant Overview — coming soon</div>;
}

function RulesPlaceholder() {
  return <div className="p-6">Rules &amp; Feedback — coming soon</div>;
}

function PreflightPlaceholder() {
  return <div className="p-6">Preflight Check — coming soon</div>;
}

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
  const [apiKeyOpen, setApiKeyOpen] = useState(false);

  return (
    <ErrorBoundary>
      <TenantProvider>
        <BrowserRouter>
          <Toaster richColors position="top-right" />
          <ApiKeyPrompt open={apiKeyOpen} onOpenChange={setApiKeyOpen} />
          <Routes>
            <Route element={<Layout onOpenApiKey={() => setApiKeyOpen(true)} />}>
              <Route path="/dashboard" element={<TaskFeed />} />
              <Route path="/dashboard/tasks/:taskId" element={<TaskDetail />} />
              <Route path="/dashboard/trigger" element={<TriggerPlaceholder />} />
              <Route path="/dashboard/tenants" element={<TenantsPlaceholder />} />
              <Route path="/dashboard/rules" element={<RulesPlaceholder />} />
              <Route path="/dashboard/preflight" element={<PreflightPlaceholder />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </TenantProvider>
    </ErrorBoundary>
  );
}
