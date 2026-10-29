import { useEffect, useState, type FormEvent } from "react";

import {
  UserRound,
  ShieldCheck,
  Bell,
  Palette,
  Building2,
  ChevronRight,
  Settings2,
  Save,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  LockKeyhole,
} from "lucide-react";

import { useAuth } from "../context/AuthContext";
import { changePassword } from "../services/api";

type SettingsTab =
  | "profile"
  | "security"
  | "notifications"
  | "appearance"
  | "organization";

export default function Settings() {
  const { user, token, updateProfile } = useAuth();

  // ==========================================
  // SETTINGS NAVIGATION
  // ==========================================

  const [activeTab, setActiveTab] =
    useState<SettingsTab>("profile");

  const isAdmin = user?.role === "admin";

  // ==========================================
  // PROFILE STATE
  // ==========================================

  const [fullName, setFullName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");

  const [isSaving, setIsSaving] = useState(false);

  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  // ==========================================
  // SECURITY STATE
  // ==========================================

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [showPasswords, setShowPasswords] = useState(false);

  const [isChangingPassword, setIsChangingPassword] =
    useState(false);

  const [passwordSuccess, setPasswordSuccess] = useState("");
  const [passwordError, setPasswordError] = useState("");

  // ==========================================
  // LOAD USER PROFILE
  // ==========================================

  useEffect(() => {
    if (user) {
      setFullName(user.full_name || "");
      setPhoneNumber(user.phone_number || "");
    }
  }, [user]);

  // ==========================================
  // CHECK PROFILE CHANGES
  // ==========================================

  const hasChanges =
    fullName.trim() !== (user?.full_name || "") ||
    phoneNumber.trim() !== (user?.phone_number || "");

  // ==========================================
  // SAVE PROFILE
  // ==========================================

  async function handleSaveProfile(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setErrorMessage("");
    setSuccessMessage("");

    const cleanedName = fullName.trim();
    const cleanedPhone = phoneNumber.trim();

    if (cleanedName.length < 2) {
      setErrorMessage(
        "Full name must contain at least 2 characters."
      );
      return;
    }

    if (
      cleanedPhone &&
      !/^\+?[0-9]{7,19}$/.test(cleanedPhone)
    ) {
      setErrorMessage(
        "Enter a valid phone number using 7 to 19 digits."
      );
      return;
    }

    setIsSaving(true);

    try {
      await updateProfile({
        full_name: cleanedName,
        phone_number: cleanedPhone || null,
      });

      setSuccessMessage(
        "Your profile has been updated successfully."
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to update your profile."
      );
    } finally {
      setIsSaving(false);
    }
  }

  // ==========================================
  // CHANGE PASSWORD
  // ==========================================

  async function handleChangePassword(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setPasswordSuccess("");
    setPasswordError("");

    if (!token) {
      setPasswordError(
        "Your session has expired. Please log in again."
      );
      return;
    }

    if (!currentPassword) {
      setPasswordError(
        "Please enter your current password."
      );
      return;
    }

    if (newPassword.length < 8) {
      setPasswordError(
        "New password must contain at least 8 characters."
      );
      return;
    }

    if (newPassword.length > 128) {
      setPasswordError(
        "New password cannot exceed 128 characters."
      );
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError(
        "New passwords do not match."
      );
      return;
    }

    if (currentPassword === newPassword) {
      setPasswordError(
        "New password must be different from your current password."
      );
      return;
    }

    setIsChangingPassword(true);

    try {
      const result = await changePassword(token, {
        current_password: currentPassword,
        new_password: newPassword,
        confirm_password: confirmPassword,
      });

      setPasswordSuccess(result.message);

      // Clear sensitive form values after success.
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");

      setShowPasswords(false);
    } catch (error) {
      setPasswordError(
        error instanceof Error
          ? error.message
          : "Unable to change your password."
      );
    } finally {
      setIsChangingPassword(false);
    }
  }

  // ==========================================
  // SETTINGS MENU
  // ==========================================

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

  // ==========================================
  // PAGE
  // ==========================================

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
                  onClick={() =>
                    setActiveTab(item.id as SettingsTab)
                  }
                  aria-current={selected ? "page" : undefined}
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
            {/* ======================================
                PROFILE
            ====================================== */}

            {activeTab === "profile" && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">
                    My Profile
                  </h2>

                  <p className="mt-1 text-sm text-slate-500">
                    Update your personal account information.
                  </p>
                </div>

                {/* PROFILE SUMMARY */}

                <div className="flex items-center gap-4 rounded-xl bg-slate-50 p-5">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-2xl font-bold text-emerald-700">
                    {user?.full_name
                      ?.charAt(0)
                      .toUpperCase() || "U"}
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

                {/* PROFILE SUCCESS */}

                {successMessage && (
                  <div
                    role="status"
                    className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"
                  >
                    <CheckCircle2
                      size={20}
                      className="shrink-0"
                    />

                    <span>{successMessage}</span>
                  </div>
                )}

                {/* PROFILE ERROR */}

                {errorMessage && (
                  <div
                    role="alert"
                    className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
                  >
                    <AlertCircle
                      size={20}
                      className="shrink-0"
                    />

                    <span>{errorMessage}</span>
                  </div>
                )}

                {/* PROFILE FORM */}

                <form
                  onSubmit={handleSaveProfile}
                  className="space-y-5"
                >
                  {/* FULL NAME */}

                  <div>
                    <label
                      htmlFor="profile-full-name"
                      className="mb-2 block text-sm font-medium text-slate-700"
                    >
                      Full Name
                    </label>

                    <input
                      id="profile-full-name"
                      type="text"
                      value={fullName}
                      onChange={(event) => {
                        setFullName(event.target.value);
                        setSuccessMessage("");
                        setErrorMessage("");
                      }}
                      minLength={2}
                      maxLength={150}
                      required
                      disabled={isSaving}
                      autoComplete="name"
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 disabled:opacity-60"
                    />
                  </div>

                  {/* PHONE NUMBER */}

                  <div>
                    <label
                      htmlFor="profile-phone"
                      className="mb-2 block text-sm font-medium text-slate-700"
                    >
                      Phone Number
                    </label>

                    <input
                      id="profile-phone"
                      type="tel"
                      value={phoneNumber}
                      onChange={(event) => {
                        setPhoneNumber(event.target.value);
                        setSuccessMessage("");
                        setErrorMessage("");
                      }}
                      maxLength={20}
                      disabled={isSaving}
                      autoComplete="tel"
                      placeholder="08012345678"
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 disabled:opacity-60"
                    />

                    <p className="mt-1 text-xs text-slate-500">
                      Optional. Leave blank to remove your phone
                      number.
                    </p>
                  </div>

                  {/* EMAIL */}

                  <div>
                    <label
                      htmlFor="profile-email"
                      className="mb-2 block text-sm font-medium text-slate-700"
                    >
                      Email Address
                    </label>

                    <input
                      id="profile-email"
                      type="email"
                      value={user?.email || ""}
                      readOnly
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-600"
                    />

                    <p className="mt-1 text-xs text-slate-500">
                      Your email address cannot be changed here.
                    </p>
                  </div>

                  {/* ROLE */}

                  <div>
                    <label
                      htmlFor="profile-role"
                      className="mb-2 block text-sm font-medium text-slate-700"
                    >
                      Account Role
                    </label>

                    <input
                      id="profile-role"
                      type="text"
                      value={user?.role || ""}
                      readOnly
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 capitalize text-slate-600"
                    />
                  </div>

                  {/* SAVE PROFILE */}

                  <div className="flex justify-end border-t border-slate-100 pt-5">
                    <button
                      type="submit"
                      disabled={
                        isSaving ||
                        !hasChanges ||
                        !user
                      }
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 py-3 font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isSaving ? (
                        <>
                          <Loader2
                            size={18}
                            className="animate-spin"
                          />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Save size={18} />
                          Save Changes
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* ======================================
                SECURITY
            ====================================== */}

            {activeTab === "security" && (
              <div className="space-y-6">
                {/* SECURITY HEADER */}

                <div className="flex items-start gap-3">
                  <div className="rounded-xl bg-emerald-100 p-3">
                    <LockKeyhole
                      size={22}
                      className="text-emerald-700"
                    />
                  </div>

                  <div>
                    <h2 className="text-xl font-bold text-slate-900">
                      Security Settings
                    </h2>

                    <p className="mt-1 text-sm text-slate-500">
                      Manage your password and protect your
                      Dumo Network account.
                    </p>
                  </div>
                </div>

                {/* SECURITY INFORMATION */}

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm font-semibold text-slate-800">
                    Change Password
                  </p>

                  <p className="mt-1 text-sm text-slate-600">
                    Enter your current password and choose
                    a new password to secure your account.
                  </p>
                </div>

                {/* PASSWORD SUCCESS */}

                {passwordSuccess && (
                  <div
                    role="status"
                    className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"
                  >
                    <CheckCircle2
                      size={20}
                      className="shrink-0"
                    />

                    <span>{passwordSuccess}</span>
                  </div>
                )}

                {/* PASSWORD ERROR */}

                {passwordError && (
                  <div
                    role="alert"
                    className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
                  >
                    <AlertCircle
                      size={20}
                      className="shrink-0"
                    />

                    <span>{passwordError}</span>
                  </div>
                )}

                {/* CHANGE PASSWORD FORM */}

                <form
                  onSubmit={handleChangePassword}
                  className="space-y-5"
                >
                  {/* CURRENT PASSWORD */}

                  <div>
                    <label
                      htmlFor="current-password"
                      className="mb-2 block text-sm font-medium text-slate-700"
                    >
                      Current Password
                    </label>

                    <input
                      id="current-password"
                      type={
                        showPasswords ? "text" : "password"
                      }
                      value={currentPassword}
                      onChange={(event) => {
                        setCurrentPassword(event.target.value);
                        setPasswordError("");
                        setPasswordSuccess("");
                      }}
                      autoComplete="current-password"
                      required
                      disabled={isChangingPassword}
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 disabled:opacity-60"
                    />
                  </div>

                  {/* NEW PASSWORD */}

                  <div>
                    <label
                      htmlFor="new-password"
                      className="mb-2 block text-sm font-medium text-slate-700"
                    >
                      New Password
                    </label>

                    <input
                      id="new-password"
                      type={
                        showPasswords ? "text" : "password"
                      }
                      value={newPassword}
                      onChange={(event) => {
                        setNewPassword(event.target.value);
                        setPasswordError("");
                        setPasswordSuccess("");
                      }}
                      autoComplete="new-password"
                      minLength={8}
                      maxLength={128}
                      required
                      disabled={isChangingPassword}
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 disabled:opacity-60"
                    />

                    <p className="mt-2 text-xs text-slate-500">
                      Use at least 8 characters. A longer,
                      unique password is recommended.
                    </p>
                  </div>

                  {/* CONFIRM PASSWORD */}

                  <div>
                    <label
                      htmlFor="confirm-password"
                      className="mb-2 block text-sm font-medium text-slate-700"
                    >
                      Confirm New Password
                    </label>

                    <input
                      id="confirm-password"
                      type={
                        showPasswords ? "text" : "password"
                      }
                      value={confirmPassword}
                      onChange={(event) => {
                        setConfirmPassword(event.target.value);
                        setPasswordError("");
                        setPasswordSuccess("");
                      }}
                      autoComplete="new-password"
                      required
                      disabled={isChangingPassword}
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 disabled:opacity-60"
                    />
                  </div>

                  {/* SHOW PASSWORDS */}

                  <button
                    type="button"
                    onClick={() =>
                      setShowPasswords((previous) => !previous)
                    }
                    disabled={isChangingPassword}
                    aria-pressed={showPasswords}
                    className="inline-flex items-center gap-2 text-sm font-medium text-emerald-700 hover:text-emerald-800 disabled:opacity-50"
                  >
                    {showPasswords ? (
                      <>
                        <EyeOff size={18} />
                        Hide Passwords
                      </>
                    ) : (
                      <>
                        <Eye size={18} />
                        Show Passwords
                      </>
                    )}
                  </button>

                  {/* SECURITY NOTE */}

                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                    <p className="text-sm text-amber-800">
                      Choose a password you do not use
                      on other websites. Changing your
                      password does not currently sign
                      out other active sessions.
                    </p>
                  </div>

                  {/* SUBMIT */}

                  <div className="flex justify-end border-t border-slate-100 pt-5">
                    <button
                      type="submit"
                      disabled={
                        isChangingPassword ||
                        !token
                      }
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 py-3 font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isChangingPassword ? (
                        <>
                          <Loader2
                            size={18}
                            className="animate-spin"
                          />
                          Changing Password...
                        </>
                      ) : (
                        <>
                          <ShieldCheck size={18} />
                          Change Password
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* ======================================
                NOTIFICATIONS
            ====================================== */}

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

            {/* ======================================
                APPEARANCE
            ====================================== */}

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

            {/* ======================================
                ORGANIZATION — ADMIN ONLY
            ====================================== */}

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