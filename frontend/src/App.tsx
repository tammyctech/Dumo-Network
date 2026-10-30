import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
} from "react-router-dom";
import { lazy, Suspense } from "react";

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

// Bulk Import Dashboard
const BulkImport = lazy(() => import("./pages/BulkImport"));

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm font-semibold text-slate-600">Loading Dumo Network…</div>}>
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
  );
}
