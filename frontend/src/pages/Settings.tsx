import { useState } from "react";
import {
  UserRound,
  ShieldCheck,
  Bell,
  Palette,
  Building2,
  ChevronRight,
  Settings2,
} from "lucide-react";

import { useAuth } from "../context/AuthContext";

type SettingsTab =
  | "profile"
  | "security"
  | "notifications"
  | "appearance"
  | "organization";

export default function Settings() {
  const { user } = useAuth();

  const [activeTab, setActiveTab] =
    useState<SettingsTab>("profile");

  const isAdmin = user?.role === "admin";

  const settingsMenu = [
    {
      id: "profile",
      name: "My Profile",
      description: "Manage your account information",
      icon: UserRound,
    },
    {
      id: "security",
      name: "Security",
      description: "Password and account protection",
      icon: ShieldCheck,
    },
    {
      id: "notifications",
      name: "Notifications",
      description: "Manage notification preferences",
      icon: Bell,
    },
    {
      id: "appearance",
      name: "Appearance",
      description: "Customize your workspace",
      icon: Palette,
    },
    ...(isAdmin
      ? [
          {
            id: "organization",
            name: "Organization",
            description: "Administrator configuration",
            icon: Building2,
          },
        ]
      : []),
  ] as const;

  return (
    <div className="space-y-8">

      {/* PAGE HEADER */}

      <div>
        <div className="mb-3 flex items-center gap-3">
          <div className="rounded-xl bg-emerald-100 p-3">
            <Settings2
              size={24}
              className="text-emerald-700"
            />
          </div>

          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              Settings
            </h1>

            <p className="text-sm text-slate-500">
              Manage your Dumo Network account and preferences.
            </p>
          </div>
        </div>
      </div>

      {/* SETTINGS LAYOUT */}

      <div className="grid gap-6 lg:grid-cols-12">

        {/* SETTINGS NAVIGATION */}

        <div className="lg:col-span-4">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">

            {settingsMenu.map((item) => {
              const Icon = item.icon;
              const selected = activeTab === item.id;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id as SettingsTab)}
                  className={`
                    flex w-full items-center gap-4
                    border-b border-slate-100
                    px-5 py-5 text-left
                    transition-colors
                    ${
                      selected
                        ? "bg-emerald-50"
                        : "hover:bg-slate-50"
                    }
                  `}
                >
                  <div
                    className={`
                      rounded-xl p-3
                      ${
                        selected
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-slate-100 text-slate-600"
                      }
                    `}
                  >
                    <Icon size={20} />
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-900">
                      {item.name}
                    </p>

                    <p className="text-xs text-slate-500">
                      {item.description}
                    </p>
                  </div>

                  <ChevronRight
                    size={18}
                    className="text-slate-400"
                  />
                </button>
              );
            })}

          </div>
        </div>

        {/* SETTINGS CONTENT */}

        <div className="lg:col-span-8">

          <div className="min-h-[400px] rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">

            {/* PROFILE */}

            {activeTab === "profile" && (
              <div className="space-y-6">

                <div>
                  <h2 className="text-xl font-bold text-slate-900">
                    My Profile
                  </h2>

                  <p className="mt-1 text-sm text-slate-500">
                    Your Dumo Network account information.
                  </p>
                </div>

                <div className="flex items-center gap-4 rounded-xl bg-slate-50 p-5">

                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-2xl font-bold text-emerald-700">
                    {user?.full_name?.charAt(0).toUpperCase() || "U"}
                  </div>

                  <div>
                    <p className="text-lg font-semibold text-slate-900">
                      {user?.full_name || "Dumo User"}
                    </p>

                    <p className="text-sm capitalize text-slate-500">
                      {user?.role || "User"}
                    </p>
                  </div>

                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Full Name
                  </label>

                  <input
                    type="text"
                    value={user?.full_name || ""}
                    readOnly
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-700"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Account Role
                  </label>

                  <input
                    type="text"
                    value={user?.role || ""}
                    readOnly
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 capitalize text-slate-700"
                  />
                </div>

                <p className="text-xs text-slate-500">
                  Profile editing will be available after the
                  account update API is connected.
                </p>

              </div>
            )}

            {/* SECURITY */}

            {activeTab === "security" && (
              <div className="space-y-4">
                <h2 className="text-xl font-bold text-slate-900">
                  Security Settings
                </h2>

                <p className="text-sm text-slate-500">
                  Manage your password and account security.
                </p>

                <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
                  Password management will be enabled after
                  secure backend verification is implemented.
                </div>
              </div>
            )}

            {/* NOTIFICATIONS */}

            {activeTab === "notifications" && (
              <div className="space-y-4">
                <h2 className="text-xl font-bold text-slate-900">
                  Notification Settings
                </h2>

                <p className="text-sm text-slate-500">
                  Control how you receive election monitoring alerts.
                </p>

                <div className="rounded-xl border border-blue-200 bg-blue-50 p-5 text-sm text-blue-800">
                  Browser notification preferences will be
                  connected to the existing push notification service.
                </div>
              </div>
            )}

            {/* APPEARANCE */}

            {activeTab === "appearance" && (
              <div className="space-y-4">
                <h2 className="text-xl font-bold text-slate-900">
                  Appearance Settings
                </h2>

                <p className="text-sm text-slate-500">
                  Customize the appearance of your workspace.
                </p>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
                  Light and dark mode preferences will be
                  available in a future update.
                </div>
              </div>
            )}

            {/* ORGANIZATION — ADMIN ONLY */}

            {activeTab === "organization" && isAdmin && (
              <div className="space-y-4">
                <h2 className="text-xl font-bold text-slate-900">
                  Organization Settings
                </h2>

                <p className="text-sm text-slate-500">
                  Configure Dumo Network administration settings.
                </p>

                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-800">
                  This section is reserved for administrators.
                  Organization configuration will be added later.
                </div>
              </div>
            )}

          </div>
        </div>

      </div>
    </div>
  );
}