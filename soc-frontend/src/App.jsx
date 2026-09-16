// =============================================================================
// src/App.jsx
// Root application component
// Renders: LoginPage (if unauthenticated) OR Sidebar + TopBar + Active Page
// =============================================================================

import { lazy, Suspense } from 'react';
import { PageLoader } from './components/common/LoadingSpinner';
import ToastContainer from './components/layout/ToastContainer';
import Sidebar from './components/layout/Sidebar';
import TopBar from './components/layout/TopBar';
import LoginPage from './pages/LoginPage';
import { useApp } from './context/AppContext';

// Lazy-load pages for performance
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const DetectionRulesPage = lazy(() => import('./pages/DetectionRulesPage'));
const CaseManagementPage = lazy(() => import('./pages/CaseManagementPage'));
const ThreatIntelPage = lazy(() => import('./pages/ThreatIntelPage'));
const AgentControlPage = lazy(() => import('./pages/AgentControlPage'));
const AuditLogsPage = lazy(() => import('./pages/AuditLogsPage'));

const PAGE_MAP = {
  dashboard: DashboardPage,
  rules: DetectionRulesPage,
  cases: CaseManagementPage,
  threats: ThreatIntelPage,
  agents: AgentControlPage,
  audit: AuditLogsPage,
};

function ActivePage() {
  const { activeTab } = useApp();
  const Page = PAGE_MAP[activeTab] || DashboardPage;

  return (
    <Suspense fallback={<PageLoader />}>
      <Page />
    </Suspense>
  );
}

export default function App() {
  const { isAuthenticated } = useApp();

  // 🔒 Nếu chưa đăng nhập → chỉ hiện Login Page
  if (!isAuthenticated) {
    return (
      <>
        <LoginPage />
        <ToastContainer />
      </>
    );
  }

  return (
    <div
      className="flex h-screen"
      style={{ background: '#0a0e17', color: '#f8fafc', minWidth: '1280px', overflow: 'hidden' }}
    >
      {/* Left Sidebar */}
      <Sidebar />

      {/* Main content area */}
      <div className="flex flex-col flex-1 overflow-hidden" style={{ minWidth: 0 }}>
        {/* Top navigation bar */}
        <TopBar />

        {/* Scrollable page content */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden">
          <ActivePage />
        </main>
      </div>

      {/* Toast notification system (fixed bottom-right) */}
      <ToastContainer />
    </div>
  );
}

