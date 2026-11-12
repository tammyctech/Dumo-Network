import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
} from "react-router-dom";
import { lazy, Suspense, useEffect, useState } from "react";

// Authentication
import { AuthProvider } from "./context/AuthContext";

// Route protection
import ProtectedRoute from "./components/ProtectedRoute";
import AdminRoute from "./components/AdminRoute";

// Shared application layout
const AppLayout = lazy(() => import("./layouts/AppLayout"));

// Public pages
const Login = lazy(() => import("./pages/Login"));
const Register = lazy(() => import("./pages/Register"));
const ActivateAgent = lazy(() => import("./pages/ActivateAgent"));
const LandingPage = lazy(() => import("./pages/LandingPage"));

// Application pages
const Dashboard = lazy(() => import("./pages/Dashboard"));
const PollingUnits = lazy(() => import("./pages/PollingUnits"));
const Analytics = lazy(() => import("./pages/Analytics"));
const AgentResults = lazy(() => import("./pages/AgentResults"));
const ResultDetails = lazy(() => import("./pages/ResultDetails"));
const Settings = lazy(() => import("./pages/Settings"));
const Incidents = lazy(() => import("./pages/Incidents"));

// Administrator pages
const AdminElections = lazy(() => import("./pages/AdminElections"));
const WardManagement = lazy(() => import("./pages/WardManagement"));
const PollingUnitManagement = lazy(() => import("./pages/PollingUnitManagement"));
const UserManagement = lazy(() => import("./pages/UserManagement"));
const AgentAssignments = lazy(() => import("./pages/AgentAssignments"));
const AdminNotifications = lazy(() => import("./pages/AdminNotifications"));
const BulkAgentRegistration = lazy(() => import("./pages/BulkAgentRegistration"));
const MandatoryPasswordChange = lazy(() => import("./pages/MandatoryPasswordChange"));

// Bulk Import Dashboard
const BulkImport = lazy(() => import("./pages/BulkImport"));

export default function App() {
  const [showInitialLoading, setShowInitialLoading] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setShowInitialLoading(false);
    }, 2000);

    return () => window.clearTimeout(timer);
  }, []);

  return (
    <>
      <BrowserRouter>
        <AuthProvider>
          <Suspense fallback={<div className="min-h-screen bg-[#F5F7FA]" />}>
            <Routes>

          {/* ============================================
              PUBLIC ROUTES
          ============================================ */}

          <Route
            path="/"
            element={<LandingPage />}
          />

          <Route
            path="/login"
            element={<Login />}
          />

          <Route
            path="/register"
            element={<Register />}
          />

          <Route
            path="/activate-agent"
            element={<ActivateAgent />}
          />

          {/* ============================================
              AUTHENTICATED ROUTES
          ============================================ */}

          <Route element={<ProtectedRoute />}>
            <Route path="/change-password" element={<MandatoryPasswordChange />} />
            <Route element={<AppLayout />}>

              {/* Dashboard */}
              <Route
                path="/dashboard"
                element={<Dashboard />}
              />

              {/* Existing Polling Units page */}
              <Route
                path="/polling-units"
                element={<PollingUnits />}
              />

              {/* Agent result submission */}
              <Route
                path="/agent-results"
                element={<AgentResults />}
              />

              {/* Polling-unit results */}
              <Route
                path="/results"
                element={<ResultDetails />}
              />

              <Route
                path="/incidents"
                element={<Incidents />}
              />

              {/* Analytics */}
              <Route
                path="/analytics"
                element={<Analytics />}
              />

              {/* ========================================
                  SETTINGS — ALL AUTHENTICATED USERS
              ======================================== */}

              <Route
                path="/settings"
                element={<Settings />}
              />

              {/* ========================================
                  ADMINISTRATOR-ONLY ROUTES
              ======================================== */}

              <Route element={<AdminRoute />}>

                {/* Election Administration */}
                <Route
                  path="/admin/elections"
                  element={<AdminElections />}
                />

                {/* Ward Management */}
                <Route
                  path="/admin/wards"
                  element={<WardManagement />}
                />

                {/* Polling Unit Management */}
                <Route
                  path="/admin/polling-units"
                  element={<PollingUnitManagement />}
                />

                {/* Bulk Import Dashboard */}
                <Route
                  path="/admin/import"
                  element={<BulkImport />}
                />
                <Route path="/admin/agent-imports" element={<BulkAgentRegistration />} />

                {/* User Management */}
                <Route
                  path="/admin/users"
                  element={<UserManagement />}
                />

                {/* Agent Assignments */}
                <Route
                  path="/admin/assignments"
                  element={<AgentAssignments />}
                />

                <Route
                  path="/admin/notifications"
                  element={<AdminNotifications />}
                />

              </Route>

            </Route>
          </Route>

          {/* ============================================
              UNKNOWN ROUTES
          ============================================ */}

          <Route
            path="*"
            element={<Navigate to="/login" replace />}
          />

            </Routes>
          </Suspense>
        </AuthProvider>
      </BrowserRouter>
      {showInitialLoading && <LoadingScreen />}
    </>
  );
}

function LoadingScreen() {
  return (
    <main
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-[200] flex min-h-screen items-center justify-center bg-[#F5F7FA] px-5"
    >
      <div className="flex flex-col items-center text-center">
        <p className="text-sm font-extrabold uppercase tracking-[0.12em] text-slate-900">
          Dumo Youth Network
        </p>
        <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-800">
          Election Monitoring System
        </p>
        <div
          className="mt-6 h-1.5 w-48 overflow-hidden rounded-full bg-emerald-100"
          role="progressbar"
          aria-label="Loading application"
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <span className="loading-progress block h-full w-full origin-left rounded-full bg-emerald-700" />
        </div>
        <span className="sr-only">Loading application…</span>
      </div>
    </main>
  );
}
