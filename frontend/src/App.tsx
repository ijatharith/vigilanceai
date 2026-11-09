import { Link, Navigate, Route, Routes } from "react-router";
import { Layout } from "./components/Layout";
import { EmptyState } from "./components/ui";
import { AppProvider } from "./lib/appContext";
import AiAnalyst from "./pages/AiAnalyst";
import Alerts from "./pages/Alerts";
import AuditLogs from "./pages/AuditLogs";
import Endpoints from "./pages/Endpoints";
import IncidentDetail from "./pages/IncidentDetail";
import Incidents from "./pages/Incidents";
import Overview from "./pages/Overview";
import Settings from "./pages/Settings";
import Soar from "./pages/Soar";

export default function App() {
  return (
    <AppProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Overview />} />
          <Route path="alerts" element={<Alerts />} />
          <Route path="incidents" element={<Incidents />} />
          <Route path="incidents/:caseId" element={<IncidentDetail />} />
          <Route path="ai-analyst" element={<AiAnalyst />} />
          <Route path="soar" element={<Soar />} />
          <Route path="endpoints" element={<Endpoints />} />
          <Route path="audit-logs" element={<AuditLogs />} />
          <Route path="settings" element={<Settings />} />
          <Route
            path="*"
            element={
              <EmptyState title="Page not found" action={<Link to="/dashboard" className="text-accent">Go to Overview</Link>}>
                This route does not exist.
              </EmptyState>
            }
          />
        </Route>
      </Routes>
    </AppProvider>
  );
}
