import { useState } from "react";

import {
  NavLink,
  Outlet,
  useNavigate,
} from "react-router-dom";

import {
  Activity,
  LayoutDashboard,
  Users,
  FileText,
  BarChart3,
  ShieldCheck,
  Settings,
  LogOut,
  Menu,
  X,
  Bell,
  CircleHelp,
  ClipboardList,
  CalendarDays,
  Layers,
  ListChecks,
  Upload,
} from "lucide-react";

import { useAuth } from "../context/AuthContext";

// =====================================================
// NAVIGATION MENU
// =====================================================

const navigation = [
  {
    name: "Dashboard",
    path: "/dashboard",
    icon: LayoutDashboard,
    available: true,
  },
  {
    name: "Submit Results",
    path: "/agent-results",
    icon: ClipboardList,
    available: true,
  },
  {
    name: "Polling-Unit Results",
    path: "/results",
    icon: FileText,
    available: true,
  },
  {
    name: "Election Admin",
    path: "/admin/elections",
    icon: CalendarDays,
    available: true,
  },
  {
    name: "Ward Management",
    path: "/admin/wards",
    icon: Layers,
    available: true,
  },
  {
    name: "Bulk Import",
    path: "/admin/import",
    icon: Upload,
    available: true,
  },
  {
    name: "Polling Unit Management",
    path: "/admin/polling-units",
    icon: ListChecks,
    available: true,
  },
  {
    name: "User Management",
    path: "/admin/users",
    icon: Users,
    available: true,
  },
  {
    name: "Agent Assignments",
    path: "/admin/assignments",
    icon: Users,
    available: true,
  },
  {
    name: "Analytics",
    path: "/analytics",
    icon: BarChart3,
    available: true,
  },
  {
    name: "Observers",
    path: "/observers",
    icon: Users,
    available: false,
  },
  {
    name: "Reports",
    path: "/reports",
    icon: FileText,
    available: false,
  },
  {
    name: "Audit Logs",
    path: "/audit-logs",
    icon: ShieldCheck,
    available: false,
  },
  {
    name: "Settings",
    path: "/settings",
    icon: Settings,
    available: false,
  },
];

// =====================================================
// APPLICATION LAYOUT
// =====================================================

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const { user, logout } = useAuth();
  const navigate = useNavigate();

  // ===================================================
  // LOGOUT
  // ===================================================

  function handleLogout() {
    logout();
    setSidebarOpen(false);
    navigate("/login", { replace: true });
  }

  // ===================================================
  // USER INITIALS
  // ===================================================

  const userInitials =
    user?.full_name
      ?.trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((name) => name.charAt(0).toUpperCase())
      .join("") || "U";

  // ===================================================
  // FILTER NAVIGATION BY USER ROLE
  // ===================================================

  const visibleNavigation = navigation.filter((item) => {
    // Administrator-only pages
    if (
      item.path === "/admin/elections" ||
      item.path === "/admin/wards" ||
      item.path === "/admin/import" ||
      item.path === "/admin/polling-units" ||
      item.path === "/admin/users" ||
      item.path === "/admin/assignments"
    ) {
      return user?.role === "admin";
    }

    // Agent-only result submission
    if (item.path === "/agent-results") {
      return user?.role === "agent";
    }

    // Administrators and agents can inspect results
    if (item.path === "/results") {
      return (
        user?.role === "admin" ||
        user?.role === "agent"
      );
    }

    return true;
  });

  // ===================================================
  // MAIN LAYOUT
  // ===================================================

  return (
    <div className="min-h-screen bg-slate-50">

      {/* MOBILE BACKDROP */}

      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-40 bg-slate-950/60 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ================================================
          SIDEBAR
      ================================================= */}

      <aside
        className={`
          fixed inset-y-0 left-0 z-50
          flex w-64 flex-col
          bg-slate-950 text-white
          transition-transform duration-300
          lg:translate-x-0
          ${
            sidebarOpen
              ? "translate-x-0"
              : "-translate-x-full"
          }
        `}
      >

        {/* LOGO */}

        <div className="flex h-20 shrink-0 items-center justify-between border-b border-white/10 px-5">

          <div className="flex min-w-0 items-center gap-2.5">

            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500">
              <Activity size={15} className="text-white" />
            </div>

            <div className="min-w-0">

              <p className="text-sm font-bold tracking-wide text-white">
                DUMO NETWORK
              </p>

              <p className="text-[10px] text-emerald-400">
                Election Monitoring
              </p>

            </div>

          </div>

          <button
            type="button"
            aria-label="Close sidebar"
            onClick={() => setSidebarOpen(false)}
            className="rounded-lg p-2 text-slate-400 hover:bg-white/10 lg:hidden"
          >
            <X size={20} />
          </button>

        </div>

        {/* WORKSPACE LABEL */}

        <div className="px-5 pb-3 pt-7">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">
            Main Workspace
          </p>
        </div>

        {/* NAVIGATION */}

        <nav
          aria-label="Main navigation"
          className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 pb-6"
        >

          {visibleNavigation.map((item) => {
            const Icon = item.icon;

            if (!item.available) {
              return (
                <div
                  key={item.name}
                  title="Coming soon"
                  className="flex cursor-not-allowed items-center gap-3 rounded-xl px-4 py-3 text-sm text-slate-500"
                >
                  <Icon size={18} />

                  <span>{item.name}</span>

                  <span className="ml-auto text-[10px]">
                    Soon
                  </span>
                </div>
              );
            }

            return (
              <NavLink
                key={item.name}
                to={item.path}
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) => `
                  flex items-center gap-3
                  rounded-xl px-4 py-3
                  text-sm font-medium
                  transition-colors duration-200
                  ${
                    isActive
                      ? "bg-emerald-500 text-white"
                      : "text-slate-300 hover:bg-white/10 hover:text-white"
                  }
                `}
              >
                <Icon size={18} />

                <span>{item.name}</span>
              </NavLink>
            );
          })}

        </nav>

        {/* ================================================
            SIDEBAR FOOTER
        ================================================= */}

        <div className="shrink-0 border-t border-white/10 p-4">

          {/* DEVELOPMENT NOTICE */}

          <div className="mb-4 rounded-xl border border-white/10 bg-white/5 p-4">

            <div className="flex items-center gap-2">

              <CircleHelp
                size={16}
                className="text-emerald-400"
              />

              <p className="text-xs font-semibold text-white">
                Development Workspace
              </p>

            </div>

            <p className="mt-2 text-xs leading-5 text-slate-400">
              Election monitoring tools are currently under development.
            </p>

          </div>

          {/* USER PROFILE */}

          <div className="mb-3 flex items-center gap-3 rounded-xl bg-white/5 p-3">

            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-sm font-bold text-emerald-300">
              {userInitials}
            </div>

            <div className="min-w-0 flex-1">

              <p className="truncate text-sm font-semibold">
                {user?.full_name || "Dumo User"}
              </p>

              <p className="text-xs capitalize text-slate-400">
                {user?.role || "Observer"}
              </p>

            </div>

          </div>

          {/* LOGOUT */}

          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-slate-300 transition hover:bg-red-500/10 hover:text-red-400"
          >
            <LogOut size={18} />
            Sign Out
          </button>

        </div>

      </aside>

      {/* ================================================
          MAIN APPLICATION
      ================================================= */}

      <div className="flex min-h-screen min-w-0 flex-col lg:pl-64">

        {/* TOP HEADER */}

        <header className="sticky top-0 z-30 flex h-20 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 shadow-sm sm:px-6 lg:px-8">

          {/* LEFT HEADER */}

          <div className="flex min-w-0 items-center gap-4">

            {/* MOBILE MENU */}

            <button
              type="button"
              aria-label="Open navigation"
              aria-expanded={sidebarOpen}
              onClick={() => setSidebarOpen(true)}
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
            >
              <Menu size={22} />
            </button>

            {/* HEADER TITLE */}

            <div className="min-w-0">

              <h2 className="truncate text-lg font-bold text-slate-900">
                Command Center
              </h2>

              <p className="hidden text-xs text-slate-500 sm:block">
                Dumo Network Election Monitoring Platform
              </p>

            </div>

          </div>

          {/* RIGHT HEADER */}

          <div className="flex items-center gap-3">

            {/* DEVELOPMENT BADGE */}

            <div className="hidden items-center gap-2 rounded-full bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700 md:flex">

              <span className="h-2 w-2 rounded-full bg-amber-500" />

              Development

            </div>

            {/* NOTIFICATIONS PLACEHOLDER */}

            <button
              type="button"
              disabled
              title="Notifications coming soon"
              aria-label="Notifications coming soon"
              className="rounded-xl p-2 text-slate-300"
            >
              <Bell size={20} />
            </button>

            {/* ACCOUNT */}

            <div className="flex items-center gap-3 border-l border-slate-200 pl-3">

              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white">
                {userInitials}
              </div>

              <div className="hidden min-w-0 md:block">

                <p className="max-w-36 truncate text-sm font-semibold text-slate-900">
                  {user?.full_name || "Dumo User"}
                </p>

                <p className="text-xs capitalize text-slate-500">
                  {user?.role || "Observer"}
                </p>

              </div>

            </div>

          </div>

        </header>

        {/* ================================================
            PAGE CONTENT
        ================================================= */}

        <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">

          <div className="mx-auto w-full max-w-7xl min-w-0">
            <Outlet />
          </div>

        </main>

        {/* FOOTER */}

        <footer className="border-t border-slate-200 bg-white px-4 py-4 text-center sm:px-6">

          <p className="text-xs text-slate-400">
            © {new Date().getFullYear()} Dumo Network.
            Election Monitoring Platform.
          </p>

          <p className="mt-1 text-xs font-medium text-amber-700">
            Unofficial — Agent-Submitted Data
          </p>

        </footer>

      </div>

    </div>
  );
}