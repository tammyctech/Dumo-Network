import { useEffect, useState, type FormEvent } from "react";

import {
  UserRound,
  ShieldCheck,
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
import PasswordChecklist from "../components/PasswordChecklist";
import { useSearchParams } from "react-router-dom";
import { applyBranding, defaultLandingText } from "../context/branding";

const API_URL = import.meta.env.DEV
  ? (import.meta.env.VITE_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "")
  : "";

type OrganizationForm = {
  organization_name: string;
  official_email: string;
  official_phone: string;
  office_address: string;
  website: string;
  logo_data_url: string | null;
  logo_title: string;
  logo_subtitle: string;
  login_heading: string;
  login_description: string;
  primary_color: string;
  background_color: string;
  text_color: string;
  font_family: string;
  font_size: number;
  font_style: string;
  background_image_data_url: string | null;
  favicon_data_url: string | null;
  landing_text: Record<string, { text: string; color: string }>;
  notification_emails: string;
  email_sender_name: string;
  sms_sender_name: string;
};

const emptyOrganization: OrganizationForm = {
  organization_name: "Dumo Youth Network", official_email: "", official_phone: "",
  office_address: "", website: "", logo_data_url: null, notification_emails: "",
  logo_title: "Dumo Youth Network", logo_subtitle: "Election Monitoring System",
  login_heading: "Welcome back.", login_description: "Enter your registered email or phone number to continue to your monitoring dashboard.",
  primary_color: "#047857", background_color: "#f6f8f7", text_color: "#0f172a",
  font_family: "Inter", font_size: 16, font_style: "normal",
  background_image_data_url: null, favicon_data_url: null,
  landing_text: defaultLandingText,
  email_sender_name: "Dumo Youth Network", sms_sender_name: "",
};

const landingTextLabels: Record<string, string> = {
  nav_results:"Navigation — Live results", nav_updates:"Navigation — Updates", nav_methodology:"Navigation — Methodology", nav_login:"Navigation — Login button",
  hero_line_1:"Hero heading — Line 1", hero_line_2:"Hero heading — Highlighted line", hero_line_3:"Hero heading — Line 3", hero_description:"Hero description", hero_results_button:"Hero — Results button", hero_login_button:"Hero — Sign-in button", hero_disclaimer:"Hero disclaimer",
  map_eyebrow:"Map section label", map_heading:"Map section heading", map_description:"Map explanation",
  totals_eyebrow:"Totals section label", totals_heading:"Totals section heading", totals_description:"Totals description",
  updates_eyebrow:"Updates section label", updates_heading:"Updates section heading", updates_description:"Updates description",
  method_eyebrow:"Method section label", method_heading:"Method section heading", method_description:"Method description",
  cta_label:"Sign-in banner label", cta_heading:"Sign-in banner heading", cta_button:"Sign-in banner button", footer_notice:"Footer notice",
};

type SettingsTab =
  | "profile"
  | "security"
  | "appearance"
  | "organization";

export default function Settings() {
  const { user, token, updateProfile } = useAuth();
  const [searchParams] = useSearchParams();

  // ==========================================
  // SETTINGS NAVIGATION
  // ==========================================

  const requestedTab = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState<SettingsTab>(
    requestedTab === "security" ||
      requestedTab === "appearance" ||
      requestedTab === "organization"
      ? requestedTab
      : "profile"
  );

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
  const [organization, setOrganization] = useState<OrganizationForm>(emptyOrganization);
  const [organizationLoading, setOrganizationLoading] = useState(false);
  const [organizationSaving, setOrganizationSaving] = useState(false);
  const [organizationError, setOrganizationError] = useState("");
  const [organizationSuccess, setOrganizationSuccess] = useState("");

  // ==========================================
  // LOAD USER PROFILE
  // ==========================================

  useEffect(() => {
    if (user) {
      setFullName(user.full_name || "");
      setPhoneNumber(user.phone_number || "");
    }
  }, [user]);

  useEffect(() => {
    if (!token || !isAdmin || activeTab !== "organization") return;
    const controller = new AbortController();
    async function loadOrganization() {
      setOrganizationLoading(true);
      setOrganizationError("");
      try {
        const response = await fetch(`${API_URL}/api/admin/organization`, {
          headers: { Authorization: `Bearer ${token}` }, signal: controller.signal,
        });
        if (!response.ok) throw new Error("Unable to load organization settings.");
        const data = await response.json();
        if (!controller.signal.aborted) setOrganization({
          organization_name: data.organization_name || "Dumo Youth Network",
          official_email: data.official_email || "", official_phone: data.official_phone || "",
          office_address: data.office_address || "", website: data.website || "",
          logo_data_url: data.logo_data_url || null,
          logo_title: data.logo_title || "Dumo Youth Network", logo_subtitle: data.logo_subtitle || "Election Monitoring System",
          login_heading: data.login_heading || "Welcome back.", login_description: data.login_description || "Enter your registered email or phone number to continue to your monitoring dashboard.",
          primary_color: data.primary_color || "#047857", background_color: data.background_color || "#f6f8f7", text_color: data.text_color || "#0f172a",
          font_family: data.font_family || "Inter", font_size: data.font_size || 16, font_style: data.font_style || "normal",
          background_image_data_url: data.background_image_data_url || null, favicon_data_url: data.favicon_data_url || null,
          landing_text: { ...defaultLandingText, ...(data.landing_text || {}) },
          notification_emails: Array.isArray(data.notification_emails) ? data.notification_emails.join("\n") : "",
          email_sender_name: data.email_sender_name || "Dumo Youth Network",
          sms_sender_name: data.sms_sender_name || "",
        });
      } catch (error) {
        if (!controller.signal.aborted) setOrganizationError(error instanceof Error ? error.message : "Unable to load organization settings.");
      } finally {
        if (!controller.signal.aborted) setOrganizationLoading(false);
      }
    }
    void loadOrganization();
    return () => controller.abort();
  }, [token, isAdmin, activeTab]);

  function updateOrganization(key: keyof OrganizationForm, value: string | number | null) {
    setOrganization((current) => ({ ...current, [key]: value }));
  }

  function updateLandingText(key: string, field: "text" | "color", value: string) {
    setOrganization((current) => ({
      ...current,
      landing_text: { ...current.landing_text, [key]: { ...current.landing_text[key], [field]: value } },
    }));
  }

  function selectBrandImage(key: "background_image_data_url" | "favicon_data_url", file: File | undefined) {
    setOrganizationError("");
    if (!file) return;
    const allowed = key === "favicon_data_url"
      ? ["image/png", "image/jpeg", "image/webp", "image/x-icon", "image/vnd.microsoft.icon", "image/svg+xml", ""]
      : ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
    const limit = key === "favicon_data_url" ? 500_000 : 2_000_000;
    if (!allowed.includes(file.type)) return setOrganizationError("Choose a supported image file.");
    if (file.size > limit) return setOrganizationError(`${key === "favicon_data_url" ? "Favicon" : "Background image"} is too large.`);
    const reader = new FileReader();
    reader.onload = () => {
      let result = String(reader.result);
      if (key === "favicon_data_url" && result.startsWith("data:application/octet-stream;")) {
        const mime = file.name.toLowerCase().endsWith(".ico") ? "image/x-icon" : "image/png";
        result = result.replace("data:application/octet-stream;", `data:${mime};`);
      }
      updateOrganization(key, result);
    };
    reader.onerror = () => setOrganizationError("Unable to read the selected image.");
    reader.readAsDataURL(file);
  }

  function selectLogo(file: File | undefined) {
    setOrganizationError("");
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp", "image/svg+xml"].includes(file.type)) {
      return setOrganizationError("Choose a PNG, JPEG, WebP, or SVG logo.");
    }
    if (file.size > 1_000_000) return setOrganizationError("Logo must not exceed 1 MB.");
    const reader = new FileReader();
    reader.onload = () => updateOrganization("logo_data_url", String(reader.result));
    reader.onerror = () => setOrganizationError("Unable to read the selected logo.");
    reader.readAsDataURL(file);
  }

  async function saveOrganization(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    setOrganizationSaving(true); setOrganizationError(""); setOrganizationSuccess("");
    const emails = organization.notification_emails.split(/[\n,;]+/).map((item) => item.trim()).filter(Boolean);
    try {
      const response = await fetch(`${API_URL}/api/admin/organization`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          ...organization,
          official_email: organization.official_email || null,
          official_phone: organization.official_phone || null,
          office_address: organization.office_address || null,
          website: organization.website || null,
          sms_sender_name: organization.sms_sender_name || null,
          notification_emails: emails,
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        const message = typeof data.detail === "string" ? data.detail : Array.isArray(data.detail) ? data.detail.map((item: { msg?: string }) => item.msg).filter(Boolean).join("; ") : "Unable to save organization settings.";
        throw new Error(message);
      }
      const data = await response.json();
      applyBranding(data);
      setOrganizationSuccess("Organization settings and branding saved successfully.");
    } catch (error) {
      setOrganizationError(error instanceof Error ? error.message : "Unable to save organization settings.");
    } finally {
      setOrganizationSaving(false);
    }
  }

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
              Manage your Dumo Youth Network Election Monitoring System account and preferences.
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
                      Dumo Youth Network Election Monitoring System account.
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

                  <PasswordChecklist password={newPassword} confirm={confirmPassword} current={currentPassword}/>

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
                        !token || newPassword.length < 8 || newPassword.length > 128 ||
                        newPassword !== confirmPassword || newPassword === currentPassword
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
                APPEARANCE
            ====================================== */}

            {activeTab === "appearance" && (
              <div className="space-y-4">
                <h2 className="text-xl font-bold text-slate-900">
                  Appearance Settings
                </h2>

                <p className="text-sm text-slate-500">
                  The workspace uses a consistent light theme with accessible green accents.
                </p>

                <div className="flex items-center gap-4 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-5">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-emerald-700 shadow-sm">
                    <Palette size={21} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-900">
                      Light appearance is enabled
                    </p>
                    <p className="mt-1 text-sm leading-6 text-slate-600">
                      Pages use bright neutral surfaces with green accents. Theme switching is disabled for a consistent experience.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* ======================================
                ORGANIZATION — ADMIN ONLY
            ====================================== */}

            {activeTab === "organization" && isAdmin && (
              <form onSubmit={saveOrganization} className="space-y-6">
                <div><h2 className="text-xl font-bold text-slate-900">Organization Settings</h2><p className="mt-1 text-sm text-slate-500">Manage public contact details, branding, notifications, and sender identities.</p></div>
                {organizationError && <div role="alert" className="flex gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><AlertCircle size={19}/>{organizationError}</div>}
                {organizationSuccess && <div role="status" className="flex gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"><CheckCircle2 size={19}/>{organizationSuccess}</div>}
                {organizationLoading ? <div className="flex items-center gap-2 py-12 text-sm text-slate-500"><Loader2 className="animate-spin"/>Loading organization settings…</div> : <>
                  <section className="space-y-4 rounded-xl border border-slate-200 p-5">
                    <h3 className="font-bold text-slate-900">Identity and branding</h3>
                    <label className="block text-sm font-medium text-slate-700">Organization name<input required minLength={2} maxLength={200} value={organization.organization_name} onChange={(e)=>updateOrganization("organization_name",e.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3"/></label>
                    <div className="flex flex-wrap items-center gap-4">
                      {organization.logo_data_url ? <img src={organization.logo_data_url} alt="Organization logo preview" className="h-20 w-20 rounded-xl border object-contain p-2"/> : <div className="grid h-20 w-20 place-items-center rounded-xl bg-slate-100"><Building2 className="text-slate-400"/></div>}
                      <div><label className="inline-flex cursor-pointer rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold hover:bg-slate-50">Choose logo<input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="sr-only" onChange={(e)=>selectLogo(e.target.files?.[0])}/></label><p className="mt-2 text-xs text-slate-500">PNG, JPEG, WebP, or SVG; maximum 1 MB.</p>{organization.logo_data_url&&<button type="button" onClick={()=>updateOrganization("logo_data_url",null)} className="mt-2 text-xs font-semibold text-red-700">Remove logo</button>}</div>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="text-sm font-medium text-slate-700">Logo title<input required minLength={2} maxLength={200} value={organization.logo_title} onChange={(e)=>updateOrganization("logo_title",e.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3"/></label>
                      <label className="text-sm font-medium text-slate-700">Logo subtitle<input required minLength={2} maxLength={200} value={organization.logo_subtitle} onChange={(e)=>updateOrganization("logo_subtitle",e.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3"/></label>
                      <label className="text-sm font-medium text-slate-700">Login heading<input required minLength={2} maxLength={200} value={organization.login_heading} onChange={(e)=>updateOrganization("login_heading",e.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3"/></label>
                      <label className="text-sm font-medium text-slate-700">Login description<textarea required rows={3} minLength={2} maxLength={500} value={organization.login_description} onChange={(e)=>updateOrganization("login_description",e.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3"/></label>
                    </div>
                  </section>
                  <section className="space-y-5 rounded-xl border border-slate-200 p-5">
                    <div><h3 className="font-bold text-slate-900">Colors, typography, and page artwork</h3><p className="mt-1 text-xs text-slate-500">These choices are applied to the login page and authenticated workspace.</p></div>
                    <div className="grid gap-4 sm:grid-cols-3">
                      {([['primary_color','Primary color'],['background_color','Background color'],['text_color','Text color']] as const).map(([key,label])=><label key={key} className="text-sm font-medium text-slate-700">{label}<span className="mt-2 flex items-center gap-2 rounded-xl border border-slate-300 p-2"><input type="color" value={organization[key]} onChange={(e)=>updateOrganization(key,e.target.value)} className="h-9 w-12 cursor-pointer rounded border-0 bg-transparent"/><input pattern="#[0-9A-Fa-f]{6}" value={organization[key]} onChange={(e)=>updateOrganization(key,e.target.value)} className="min-w-0 flex-1 bg-transparent font-mono text-sm outline-none"/></span></label>)}
                    </div>
                    <div className="grid gap-4 sm:grid-cols-3">
                      <label className="text-sm font-medium text-slate-700">Font family<select value={organization.font_family} onChange={(e)=>updateOrganization("font_family",e.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3">{["Inter","Arial","Georgia","Verdana","Tahoma","Trebuchet MS","Courier New"].map(font=><option key={font}>{font}</option>)}</select></label>
                      <label className="text-sm font-medium text-slate-700">Font size ({organization.font_size}px)<input type="range" min={12} max={22} value={organization.font_size} onChange={(e)=>updateOrganization("font_size",Number(e.target.value))} className="mt-4 w-full accent-emerald-700"/></label>
                      <label className="text-sm font-medium text-slate-700">Font style<select value={organization.font_style} onChange={(e)=>updateOrganization("font_style",e.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3"><option value="normal">Normal</option><option value="italic">Italic</option></select></label>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="rounded-xl border border-slate-200 p-4"><p className="text-sm font-semibold text-slate-800">Background image</p>{organization.background_image_data_url&&<img src={organization.background_image_data_url} alt="Background preview" className="mt-3 h-28 w-full rounded-lg object-cover"/>}<div className="mt-3 flex flex-wrap gap-3"><label className="cursor-pointer rounded-lg border px-3 py-2 text-xs font-semibold hover:bg-slate-50">Choose image<input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="sr-only" onChange={(e)=>selectBrandImage("background_image_data_url",e.target.files?.[0])}/></label>{organization.background_image_data_url&&<button type="button" onClick={()=>updateOrganization("background_image_data_url",null)} className="text-xs font-semibold text-red-700">Remove</button>}</div><p className="mt-2 text-xs text-slate-500">Maximum 2 MB.</p></div>
                      <div className="rounded-xl border border-slate-200 p-4"><p className="text-sm font-semibold text-slate-800">Browser favicon</p>{organization.favicon_data_url?<img src={organization.favicon_data_url} alt="Favicon preview" className="mt-3 h-14 w-14 rounded-lg border object-contain p-1"/>:<div className="mt-3 grid h-14 w-14 place-items-center rounded-lg bg-slate-100 text-xs text-slate-400">Icon</div>}<input type="file" accept=".png,.jpg,.jpeg,.webp,.ico,.svg" className="mt-3 block w-full cursor-pointer rounded-lg border border-slate-300 bg-white text-xs file:mr-3 file:border-0 file:border-r file:border-slate-200 file:bg-slate-50 file:px-3 file:py-2.5 file:font-semibold" onChange={(e)=>selectBrandImage("favicon_data_url",e.currentTarget.files?.[0])}/>{organization.favicon_data_url&&<button type="button" onClick={()=>updateOrganization("favicon_data_url",null)} className="mt-3 text-xs font-semibold text-red-700">Remove favicon</button>}<p className="mt-2 text-xs text-slate-500">Select one PNG, JPG, WebP, ICO, or SVG image; maximum 500 KB.</p></div>
                    </div>
                    <div className="overflow-hidden rounded-2xl border border-slate-200 shadow-sm" style={{backgroundColor:organization.background_color,color:organization.text_color,fontFamily:organization.font_family,fontSize:organization.font_size,fontStyle:organization.font_style,backgroundImage:organization.background_image_data_url?`linear-gradient(rgb(255 255 255 / .78),rgb(255 255 255 / .78)),url(${organization.background_image_data_url})`:undefined,backgroundSize:"cover"}}><div className="flex items-center gap-3 border-b border-black/10 p-4">{organization.logo_data_url?<img src={organization.logo_data_url} alt="" className="h-10 w-10 rounded-lg bg-white object-contain p-1"/>:<Building2/>}<div><p className="font-bold">{organization.logo_title}</p><p className="text-xs opacity-70">{organization.logo_subtitle}</p></div></div><div className="p-6"><p className="text-2xl font-bold">{organization.login_heading}</p><p className="mt-2 opacity-75">{organization.login_description}</p><button type="button" className="mt-5 rounded-lg px-4 py-2 text-sm font-bold text-white" style={{backgroundColor:organization.primary_color}}>Preview button</button></div></div>
                  </section>
                  <section className="space-y-5 rounded-xl border border-slate-200 p-5">
                    <div><h3 className="font-bold text-slate-900">Landing-page text and colors</h3><p className="mt-1 text-xs leading-5 text-slate-500">Edit each public-page text block and choose its exact text color. Dynamic election figures and polling-unit names remain generated from live data.</p></div>
                    <div className="grid gap-4 lg:grid-cols-2">
                      {Object.entries(landingTextLabels).map(([key,label])=>{const item=organization.landing_text[key]||defaultLandingText[key];return <div key={key} className="rounded-xl border border-slate-200 bg-slate-50/60 p-4"><label className="text-xs font-bold uppercase tracking-wide text-slate-600">{label}<textarea rows={item.text.length>90?3:2} maxLength={600} required value={item.text} onChange={(e)=>updateLandingText(key,"text",e.target.value)} className="mt-2 w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900"/></label><label className="mt-3 flex items-center gap-3 text-xs font-semibold text-slate-600">Text color<input type="color" value={item.color} onChange={(e)=>updateLandingText(key,"color",e.target.value)} className="h-9 w-12 cursor-pointer rounded border-0 bg-transparent"/><input value={item.color} pattern="#[0-9A-Fa-f]{6}" onChange={(e)=>updateLandingText(key,"color",e.target.value)} className="w-28 rounded-lg border border-slate-300 bg-white px-2 py-1.5 font-mono"/><span className="min-w-0 flex-1 truncate rounded-lg bg-white px-3 py-2" style={{color:item.color}}>{item.text}</span></label></div>})}
                    </div>
                  </section>
                  <section className="grid gap-4 rounded-xl border border-slate-200 p-5 sm:grid-cols-2">
                    <h3 className="font-bold text-slate-900 sm:col-span-2">Official contact details</h3>
                    <label className="text-sm font-medium text-slate-700">Official email<input type="email" value={organization.official_email} onChange={(e)=>updateOrganization("official_email",e.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3"/></label>
                    <label className="text-sm font-medium text-slate-700">Official phone<input inputMode="tel" value={organization.official_phone} onChange={(e)=>updateOrganization("official_phone",e.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3" placeholder="+234…"/></label>
                    <label className="text-sm font-medium text-slate-700 sm:col-span-2">Office address<textarea rows={3} maxLength={500} value={organization.office_address} onChange={(e)=>updateOrganization("office_address",e.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3"/></label>
                    <label className="text-sm font-medium text-slate-700 sm:col-span-2">Website<input type="url" value={organization.website} onChange={(e)=>updateOrganization("website",e.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3" placeholder="https://example.org"/></label>
                  </section>
                  <section className="space-y-4 rounded-xl border border-slate-200 p-5">
                    <h3 className="font-bold text-slate-900">Notifications and sender names</h3>
                    <label className="block text-sm font-medium text-slate-700">Admin notification email addresses<textarea rows={4} value={organization.notification_emails} onChange={(e)=>updateOrganization("notification_emails",e.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3" placeholder={"admin@example.com\nresults@example.com"}/><span className="mt-1 block text-xs font-normal text-slate-500">Enter one address per line. Up to 20 addresses.</span></label>
                    <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium text-slate-700">Email sender name<input required minLength={2} maxLength={100} value={organization.email_sender_name} onChange={(e)=>updateOrganization("email_sender_name",e.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3"/></label><label className="text-sm font-medium text-slate-700">SMS sender name<input minLength={3} maxLength={11} value={organization.sms_sender_name} onChange={(e)=>updateOrganization("sms_sender_name",e.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3" placeholder="DumoNetwork"/><span className="mt-1 block text-xs font-normal text-slate-500">Must also be approved in Termii.</span></label></div>
                    <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">Provider credentials remain securely configured in Render environment variables. This page never displays SMTP passwords or the Termii API key.</p>
                  </section>
                  <button type="submit" disabled={organizationSaving} className="flex min-h-11 items-center gap-2 rounded-xl bg-emerald-700 px-5 py-3 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-50">{organizationSaving?<Loader2 size={18} className="animate-spin"/>:<Save size={18}/>} {organizationSaving?"Saving…":"Save organization settings"}</button>
                </>}
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
