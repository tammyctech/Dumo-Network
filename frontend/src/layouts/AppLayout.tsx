import { Fragment, useEffect, useRef, useState } from "react";

import {
  NavLink,
  useLocation,
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
  ClipboardList,
  CalendarDays,
  Layers,
  ListChecks,
  Upload,
  Siren,
  BellRing,
  ChevronRight,
  SlidersHorizontal,
  MapPin,
} from "lucide-react";

import { useAuth } from "../context/AuthContext";

// =====================================================
// NAVIGATION MENU
// =====================================================

const navigation = [
  {
    name: "Dashboard",
    path: "/dashboard",
    section: "Overview",
    icon: LayoutDashboard,
    available: true,
  },
  {
    name: "Submit Results",
    path: "/agent-results",
    section: "Monitoring",
    icon: ClipboardList,
    available: true,
  },
  {
    name: "Polling-Unit Results",
    path: "/results",
    section: "Monitoring",
    icon: FileText,
    available: true,
  },
  {
    name: "Incident Centre",
    path: "/incidents",
    section: "Monitoring",
    icon: Siren,
    available: true,
  },
  {
    name: "Analytics",
    path: "/analytics",
    section: "Monitoring",
    icon: BarChart3,
    available: true,
  },
  {
    name: "Election Admin",
    path: "/admin/elections",
    section: "Administration",
    icon: CalendarDays,
    available: true,
  },
  {
    name: "Ward Management",
    path: "/admin/wards",
    section: "Administration",
    icon: Layers,
    available: true,
  },
  {
    name: "Bulk Import",
    path: "/admin/import",
    section: "Administration",
    icon: Upload,
    available: true,
  },
  {
    name: "Polling Unit Management",
    path: "/admin/polling-units",
    section: "Administration",
    icon: ListChecks,
    available: true,
  },
  {
    name: "User Management",
    path: "/admin/users",
    section: "Administration",
    icon: Users,
    available: true,
  },
  {
    name: "Agent Assignments",
    path: "/admin/assignments",
    section: "Administration",
    icon: Users,
    available: true,
  },
  {
    name: "Notification Centre",
    path: "/admin/notifications",
    section: "Administration",
    icon: Bell,
    available: true,
  },
  {
    name: "Settings",
    path: "/settings",
    section: "Account",
    icon: Settings,
    available: true,
  },
];

const CURRENT_YEAR = new Date().getFullYear();

// =====================================================
// APPLICATION LAYOUT
// =====================================================

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const isDashboardPage = pathname === "/dashboard";

  useEffect(() => {
    function closeMenusOutside(event: PointerEvent) {
      if (!(event.target instanceof Node)) return;

      if (notificationsRef.current && !notificationsRef.current.contains(event.target)) {
        setNotificationsOpen(false);
      }

      if (profileRef.current && !profileRef.current.contains(event.target)) {
        setProfileOpen(false);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setNotificationsOpen(false);
        setProfileOpen(false);
        setSidebarOpen(false);
      }
    }

    document.addEventListener("pointerdown", closeMenusOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeMenusOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  // ===================================================
  // LOGOUT
  // ===================================================

  function handleLogout() {
    logout();
    setSidebarOpen(false);
    setProfileOpen(false);
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
    if (item.path.startsWith("/admin/")) {
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
  const currentPage = navigation.find((item) => item.path === pathname);

  // ===================================================
  // MAIN LAYOUT
  // ===================================================

  return (
    <div
      className="min-h-screen bg-canvas"
    >

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
        aria-label="Application navigation"
        className={`
          fixed inset-y-0 left-0 z-50
          flex w-64 flex-col
          border-r border-slate-200 bg-white text-slate-800 shadow-xl shadow-slate-900/5
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

        <div className="flex h-[76px] shrink-0 items-center justify-between border-b border-slate-200 px-5">

          <div className="flex min-w-0 items-center gap-2.5">

            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-700 shadow-sm shadow-emerald-900/15">
              <Activity size={15} className="text-white" />
            </div>

            <div className="min-w-0">

              <p className="text-[13px] font-bold tracking-[0.07em] text-slate-900">
                DUMO YOUTH NETWORK
              </p>

              <p className="text-[10px] text-emerald-700">
                ELECTION MONITORING SYSTEM
              </p> 

            </div>

          </div>

          <button
            type="button"
            aria-label="Close sidebar"
            onClick={() => setSidebarOpen(false)}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden"
          >
            <X size={20} />
          </button>

        </div>

        {/* WORKSPACE LABEL */}

        <div className="px-5 pb-3 pt-6">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
            Main Workspace
          </p>
        </div>

        {/* NAVIGATION */}

        <nav
          aria-label="Main navigation"
          className="min-h-0 flex-1 overflow-y-auto px-3 pb-6"
        >

          {visibleNavigation.map((item, index) => {
            const Icon = item.icon;
            const showSection =
              index === 0 ||
              item.section !== visibleNavigation[index - 1].section;

            return (
              <Fragment key={item.name}>
                {showSection && (
                  <p
                    className={`px-3 pb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500 ${
                      index === 0 ? "pt-6" : "pt-5"
                    }`}
                  >
                    {item.section}
                  </p>
                )}
                <NavLink
                  to={item.path}
                  onClick={() => setSidebarOpen(false)}
                  className={({ isActive }) => `
                    flex min-h-11 items-center gap-3
                    rounded-lg border-l-2 px-3 py-2.5
                    text-[13px] font-medium
                    transition-colors duration-200
                    ${
                      isActive
                        ? "border-emerald-700 bg-emerald-50 text-emerald-800"
                        : "border-transparent text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                    }
                  `}
                >
                  <Icon size={18} />
                  <span>{item.name}</span>
                </NavLink>
              </Fragment>
            );
          })}

        </nav>

        {/* ================================================
            SIDEBAR FOOTER
        ================================================= */}

        <div className="shrink-0 border-t border-slate-200 p-4">

          {/* DATA NOTICE */}

          <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3.5">

            <div className="flex items-center gap-2">

              <ShieldCheck
                size={16}
                className="text-emerald-700"
              />

              <p className="text-xs font-semibold text-slate-800">
                Election data
              </p>

            </div>

            <p className="mt-2 text-xs leading-5 text-slate-500">
              Monitoring figures are unofficial and agent-submitted.
            </p>

          </div>

          {/* USER PROFILE */}

          <div className="mb-3 flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">

            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-800">
              {userInitials}
            </div>

            <div className="min-w-0 flex-1">

              <p className="truncate text-sm font-semibold">
                {user?.full_name || "Dumo User"}
              </p>

              <p className="text-xs capitalize text-slate-500">
                {user?.role || "Observer"}
              </p>

            </div>

          </div>

          {/* LOGOUT */}

          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-slate-600 transition hover:bg-red-50 hover:text-red-700"
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

        <header className="sticky top-0 z-30 flex h-[76px] shrink-0 items-center justify-between border-b border-slate-200/80 bg-white/95 px-4 backdrop-blur-xl sm:px-6 lg:px-8">

          {/* LEFT HEADER */}

          <div className="flex min-w-0 items-center gap-4">

            {/* MOBILE MENU */}

            <button
              type="button"
              aria-label="Open navigation"
              aria-expanded={sidebarOpen}
              onClick={() => setSidebarOpen(true)}
              className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 lg:hidden"
            >
              <Menu size={22} />
            </button>

            {/* HEADER TITLE */}

            <div className="min-w-0">

              <h1 className="truncate text-base font-semibold tracking-tight text-slate-900">
                {currentPage?.name ?? "Dumo Youth Network Election Monitoring System"}
              </h1>

              <p className="hidden text-[11px] font-medium text-emerald-700 sm:block">
                {currentPage?.section ?? "Rivers State"}
              </p>

            </div>

          </div>

          {/* RIGHT HEADER */}

          <div className="flex items-center gap-3">

            {/* OPERATING AREA */}

            <div className="hidden items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-semibold text-slate-600 md:flex">
              <MapPin size={13} className="text-emerald-700" />
              Rivers State

            </div>

            {/* NOTIFICATIONS */}

            <div ref={notificationsRef} className="relative">
              <button
                type="button"
                title="Notification options"
                aria-label="Open notification options"
                aria-expanded={notificationsOpen}
                aria-haspopup="dialog"
                onClick={() => {
                  setProfileOpen(false);
                  setNotificationsOpen((open) => !open);
                }}
                className={`relative rounded-xl border p-2.5 transition focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 ${
                  notificationsOpen
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <Bell size={20} />
              </button>

              {notificationsOpen && (
                <div
                  role="dialog"
                  aria-label="Notifications panel"
                  className="fixed inset-x-3 top-[4.75rem] z-50 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-950/20 sm:absolute sm:inset-x-auto sm:right-0 sm:top-14 sm:w-[25rem]"
                >
                  <div className="border-b border-slate-200 bg-white px-5 py-5 text-slate-900">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">
                          <BellRing size={14} /> Notification settings
                        </div>
                        <h3 className="mt-2 text-xl font-bold">Manage notifications</h3>
                        <p className="mt-1 text-xs leading-5 text-slate-600">
                          Configure this browser or review campaign delivery.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="p-4">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-sm font-semibold text-slate-900">
                        No in-app notification feed
                      </p>
                      <p className="mt-1 text-xs leading-5 text-slate-600">
                        Browser subscription settings and campaign delivery reports are available in their respective sections.
                      </p>
                    </div>

                    <div className="mt-4 space-y-2">
                      {user?.role === "admin" && (
                        <button
                          type="button"
                          onClick={() => {
                            setNotificationsOpen(false);
                            navigate("/admin/notifications");
                          }}
                          className="group flex w-full items-center gap-3 rounded-xl border border-slate-200 p-3 text-left transition hover:border-emerald-200 hover:bg-emerald-50/60"
                        >
                          <span className="rounded-lg bg-slate-100 p-2 text-slate-700 group-hover:bg-emerald-100 group-hover:text-emerald-800">
                            <BellRing size={17} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <strong className="block text-sm text-slate-900">Open Notification Centre</strong>
                            <span className="mt-0.5 block text-xs text-slate-500">Send campaigns and review delivery outcomes</span>
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
                        className="group flex w-full items-center gap-3 rounded-xl border border-slate-200 p-3 text-left transition hover:border-emerald-200 hover:bg-emerald-50/60"
                      >
                        <span className="rounded-lg bg-slate-100 p-2 text-slate-700 group-hover:bg-emerald-100 group-hover:text-emerald-800">
                          <SlidersHorizontal size={17} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <strong className="block text-sm text-slate-900">Notification preferences</strong>
                          <span className="mt-0.5 block text-xs text-slate-500">Manage this browser and registered devices</span>
                        </span>
                        <ChevronRight size={17} className="text-slate-400 group-hover:text-emerald-700" />
                      </button>
                    </div>
                  </div>

                  <div className="border-t border-slate-100 bg-slate-50 px-4 py-3 text-center text-[11px] font-medium text-slate-500">
                    Delivery is reported by the notification service; device receipt is not guaranteed.
                  </div>
                </div>
              )}
            </div>

            {/* ACCOUNT */}

            <div ref={profileRef} className="relative border-l border-slate-200 pl-3 sm:pl-4">
              <button
                type="button"
                aria-label={`Account options for ${user?.full_name || "Dumo User"}`}
                aria-expanded={profileOpen}
                onClick={() => {
                  setNotificationsOpen(false);
                  setProfileOpen((open) => !open);
                }}
                className="flex min-h-11 items-center gap-2 rounded-xl px-1.5 text-left hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 sm:gap-3 sm:px-2"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-800 ring-2 ring-white">
                  {userInitials}
                </span>
                <span className="hidden min-w-0 md:block">
                  <span className="block max-w-36 truncate text-sm font-semibold text-slate-900">
                    {user?.full_name || "Dumo User"}
                  </span>
                  <span className="block text-xs capitalize text-slate-500">
                    {user?.role || "Observer"}
                  </span>
                </span>
              </button>

              {profileOpen && (
                <div
                  className="absolute right-0 top-14 z-50 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl"
                >
                  <nav aria-label="Account options">
                    <NavLink
                      to="/settings"
                      onClick={() => setProfileOpen(false)}
                      className="flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600"
                    >
                      <Settings size={17} />
                      Account settings
                    </NavLink>
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-red-700 hover:bg-red-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-600"
                    >
                      <LogOut size={17} />
                      Sign out
                    </button>
                  </nav>
                </div>
              )}
            </div>

          </div>

        </header>

        {/* ================================================
            PAGE CONTENT
        ================================================= */}

        <main
          className={`min-w-0 flex-1 px-4 py-7 sm:px-6 sm:py-8 lg:px-9 lg:py-9 ${
            isDashboardPage ? "dashboard-canvas" : "bg-canvas"
          }`}
        >

          <div className="mx-auto w-full max-w-[1440px] min-w-0">
            <Outlet />
          </div>

        </main>

        {/* FOOTER */}

        <footer className="border-t border-slate-200/80 bg-white/80 px-4 py-4 text-center sm:px-6">

          <p className="text-xs text-slate-400">
            © {CURRENT_YEAR} Dumo Youth Network Election Monitoring System.
          </p>

          <p className="mt-1 text-xs font-medium text-amber-700">
            Unofficial — Agent-Submitted Data
          </p>

        </footer>

      </div>

    </div>
  );
}
