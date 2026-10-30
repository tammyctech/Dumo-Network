import { useEffect, useRef, useState } from "react";

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
  Siren,
  BellRing,
  CheckCircle2,
  ChevronRight,
  SlidersHorizontal,
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
    name: "Incident Centre",
    path: "/incidents",
    icon: Siren,
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
    name: "Notification Centre",
    path: "/admin/notifications",
    icon: Bell,
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
    available: true,
  },
];

// =====================================================
// APPLICATION LAYOUT
// =====================================================

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const notificationsRef = useRef<HTMLDivElement>(null);

  const { user, logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    function closeNotifications(event: MouseEvent) {
      if (
        notificationsRef.current &&
        !notificationsRef.current.contains(event.target as Node)
      ) {
        setNotificationsOpen(false);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setNotificationsOpen(false);
    }

    document.addEventListener("mousedown", closeNotifications);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeNotifications);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

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
      item.path === "/admin/import" ||
      item.path === "/admin/polling-units" ||
      item.path === "/admin/users" ||
      item.path === "/admin/assignments" ||
      item.path === "/admin/notifications"
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
                DUMO YOUTH NETWORK
              </p>

              <p className="text-[10px] text-emerald-400">
                Election Monitoring System
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

            {/* NOTIFICATIONS */}

            <div ref={notificationsRef} className="relative">
              <button
                type="button"
                title="Open notifications"
                aria-label="Open notifications"
                aria-expanded={notificationsOpen}
                aria-haspopup="dialog"
                onClick={() => setNotificationsOpen((open) => !open)}
                className={`relative rounded-xl border p-2.5 transition focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 ${
                  notificationsOpen
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-800 dark:hover:text-white"
                }`}
              >
                <Bell size={20} />
                <span className="absolute right-2 top-2 h-2 w-2 rounded-full border-2 border-white bg-emerald-500" />
              </button>

              {notificationsOpen && (
                <div
                  role="dialog"
                  aria-label="Notifications panel"
                  className="fixed inset-x-3 top-[4.75rem] z-50 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-950/20 sm:absolute sm:inset-x-auto sm:right-0 sm:top-14 sm:w-[25rem]"
                >
                  <div className="relative overflow-hidden bg-slate-950 px-5 py-5 text-white">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_85%_10%,rgba(16,185,129,.28),transparent_38%)]" />
                    <div className="relative flex items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-emerald-300">
                          <BellRing size={14} /> Live communications
                        </div>
                        <h3 className="mt-2 text-xl font-black">Notifications</h3>
                        <p className="mt-1 text-xs leading-5 text-slate-300">
                          Operational alerts and election updates from Dumo Network.
                        </p>
                      </div>
                      <span className="mt-0.5 inline-flex items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-bold text-emerald-200">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Online
                      </span>
                    </div>
                  </div>

                  <div className="p-4">
                    <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4 dark:border-emerald-800 dark:bg-emerald-950/60">
                      <div className="flex gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-700 text-white">
                          <CheckCircle2 size={18} />
                        </span>
                        <div>
                          <p className="text-sm font-black text-slate-900 dark:text-white">You are all caught up</p>
                          <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">
                            New urgent updates will appear as browser notifications on enabled devices.
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 space-y-2">
                      {user?.role === "admin" && (
                        <button
                          type="button"
                          onClick={() => {
                            setNotificationsOpen(false);
                            navigate("/admin/notifications");
                          }}
                          className="group flex w-full items-center gap-3 rounded-xl border border-slate-200 p-3 text-left transition hover:border-emerald-200 hover:bg-emerald-50/60 dark:border-slate-700 dark:hover:border-emerald-700 dark:hover:bg-emerald-950/70"
                        >
                          <span className="rounded-lg bg-slate-100 p-2 text-slate-700 group-hover:bg-emerald-100 group-hover:text-emerald-800 dark:bg-slate-800 dark:text-slate-300 dark:group-hover:bg-emerald-900 dark:group-hover:text-emerald-200">
                            <BellRing size={17} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <strong className="block text-sm text-slate-900 dark:text-slate-100">Open Notification Centre</strong>
                            <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">Create and review delivery campaigns</span>
                          </span>
                          <ChevronRight size={17} className="text-slate-400 group-hover:text-emerald-700" />
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          setNotificationsOpen(false);
                          navigate("/settings?tab=notifications");
                        }}
                        className="group flex w-full items-center gap-3 rounded-xl border border-slate-200 p-3 text-left transition hover:border-emerald-200 hover:bg-emerald-50/60 dark:border-slate-700 dark:hover:border-emerald-700 dark:hover:bg-emerald-950/70"
                      >
                        <span className="rounded-lg bg-slate-100 p-2 text-slate-700 group-hover:bg-emerald-100 group-hover:text-emerald-800 dark:bg-slate-800 dark:text-slate-300 dark:group-hover:bg-emerald-900 dark:group-hover:text-emerald-200">
                          <SlidersHorizontal size={17} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <strong className="block text-sm text-slate-900 dark:text-slate-100">Notification preferences</strong>
                          <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">Manage this browser and registered devices</span>
                        </span>
                        <ChevronRight size={17} className="text-slate-400 group-hover:text-emerald-700" />
                      </button>
                    </div>
                  </div>

                  <div className="border-t border-slate-100 bg-slate-50 px-4 py-3 text-center text-[11px] font-medium text-slate-500">
                    Push delivery is protected by your browser permissions.
                  </div>
                </div>
              )}
            </div>

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
