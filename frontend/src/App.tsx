import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
} from "react-router-dom";

// Authentication
import { AuthProvider } from "./context/AuthContext";

// Route protection
import ProtectedRoute from "./components/ProtectedRoute";
import AdminRoute from "./components/AdminRoute";

// Shared application layout
import AppLayout from "./layouts/AppLayout";

// Public pages
import Login from "./pages/Login";
import Register from "./pages/Register";
import ActivateAgent from "./pages/ActivateAgent";

// Application pages
import Dashboard from "./pages/Dashboard";
import PollingUnits from "./pages/PollingUnits";
import Analytics from "./pages/Analytics";
import AgentResults from "./pages/AgentResults";
import ResultDetails from "./pages/ResultDetails";
import Settings from "./pages/Settings";

// Administrator pages
import AdminElections from "./pages/AdminElections";
import WardManagement from "./pages/WardManagement";
import PollingUnitManagement from "./pages/PollingUnitManagement";
import UserManagement from "./pages/UserManagement";
import AgentAssignments from "./pages/AgentAssignments";

// Bulk Import Dashboard
import BulkImport from "./pages/BulkImport";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>

          {/* ============================================
              PUBLIC ROUTES
          ============================================ */}

          <Route
            path="/"
            element={<Navigate to="/login" replace />}
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
      </AuthProvider>
    </BrowserRouter>
  );
}