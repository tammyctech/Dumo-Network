import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";

import {
  Activity,
  ArrowRight,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  UserRound,
  ShieldCheck,
  MapPinned,
  CheckCircle2,
  AlertCircle,
  LoaderCircle,
  Fingerprint,
  Users,
  BarChart3,
} from "lucide-react";

import { registerUser } from "../services/api";

export default function Register() {
  const navigate = useNavigate();

  // ========================================
  // FORM STATE
  // ========================================

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // ========================================
  // PASSWORD VALIDATION
  // ========================================

  const passwordChecks = [
    {
      label: "At least 12 characters",
      valid: password.length >= 12,
    },
    {
      label: "One uppercase letter",
      valid: /[A-Z]/.test(password),
    },
    {
      label: "One lowercase letter",
      valid: /[a-z]/.test(password),
    },
    {
      label: "One number",
      valid: /\d/.test(password),
    },
    {
      label: "One special character",
      valid: /[^A-Za-z0-9]/.test(password),
    },
  ];

  const passwordScore = passwordChecks.filter(
    (check) => check.valid
  ).length;

  const passwordsMatch =
    confirmPassword.length > 0 &&
    password === confirmPassword;

  const passwordStrength =
    passwordScore <= 2
      ? "Weak"
      : passwordScore <= 4
      ? "Moderate"
      : "Strong";

  const strengthColor =
    passwordScore <= 2
      ? "bg-red-500"
      : passwordScore <= 4
      ? "bg-amber-500"
      : "bg-emerald-500";

  const strengthTextColor =
    passwordScore <= 2
      ? "text-red-600"
      : passwordScore <= 4
      ? "text-amber-600"
      : "text-emerald-600";

  // ========================================
  // FORM SUBMISSION
  // ========================================

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (loading) return;

    setError("");

    if (fullName.trim().length < 2) {
      setError("Please enter your full name.");
      return;
    }

    if (passwordScore !== 5) {
      setError(
        "Your password must meet all the security requirements."
      );
      return;
    }

    if (password !== confirmPassword) {
      setError("Your passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      await registerUser({
        full_name: fullName.trim(),
        email: email.trim().toLowerCase(),
        password,
      });

      navigate("/login", {
        replace: true,
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to create your account. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  // ========================================
  // INPUT STYLES
  // ========================================

  const inputClass =
    "h-14 w-full rounded-xl border border-slate-200 bg-slate-50/60 pl-12 pr-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-500/10 disabled:opacity-60";

  // ========================================
  // PAGE
  // ========================================

  return (
    <div className="min-h-screen bg-[#F5F7FA] lg:grid lg:grid-cols-2">

      {/* =====================================
          LEFT PANEL — BRAND EXPERIENCE
      ===================================== */}

      <div className="relative hidden min-h-screen overflow-hidden bg-[#071C25] text-white lg:flex lg:flex-col">

        {/* BACKGROUND EFFECTS */}

        <div className="pointer-events-none absolute -left-40 -top-40 h-[500px] w-[500px] rounded-full bg-emerald-500/10 blur-[100px]" />

        <div className="pointer-events-none absolute -bottom-40 -right-40 h-[500px] w-[500px] rounded-full bg-teal-400/10 blur-[120px]" />

        <div
          className="pointer-events-none absolute inset-0 opacity-[0.035]"
          style={{
            backgroundImage:
              "linear-gradient(#ffffff 1px, transparent 1px), linear-gradient(90deg, #ffffff 1px, transparent 1px)",
            backgroundSize: "45px 45px",
          }}
        />

        {/* BRAND */}

        <div className="relative z-10 flex items-center gap-3 px-12 pt-12 xl:px-20">

          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500 shadow-lg shadow-emerald-500/20">
            <Activity size={25} strokeWidth={2.5} />
          </div>

          <div>
            <h1 className="text-lg font-extrabold tracking-tight">
              DUMO YOUTH NETWORK
            </h1>

            <p className="text-xs font-medium tracking-[0.2em] text-emerald-400">
              ELECTION MONITORING
            </p>
          </div>

        </div>

        {/* MAIN CONTENT */}

        <div className="relative z-10 flex flex-1 flex-col justify-center px-12 py-16 xl:px-20">

          {/* BADGE */}

          <div className="mb-9 inline-flex w-fit items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-4 py-2">

            <span className="h-2 w-2 rounded-full bg-emerald-400" />

            <span className="text-xs font-semibold tracking-wide text-emerald-300">
              RIVERS STATE · NIGERIA
            </span>

          </div>

          {/* HEADLINE */}

          <h2 className="max-w-xl text-5xl font-bold leading-[1.12] tracking-tight xl:text-6xl">
            Be Part of
            <br />
            Something
            <br />
            <span className="text-emerald-400">
              Meaningful.
            </span>
          </h2>

          <p className="mt-8 max-w-lg text-base leading-8 text-slate-300">
            Join a digital community supporting organised
            election monitoring, transparent reporting,
            and civic participation across Rivers State.
          </p>

          {/* FEATURES */}

          <div className="mt-12 space-y-5">

            <div className="flex items-center gap-4">

              <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/5">
                <Users size={21} className="text-emerald-400" />
              </div>

              <div>
                <h3 className="text-sm font-semibold">
                  Community Participation
                </h3>

                <p className="mt-1 text-xs text-slate-400">
                  Join the election monitoring workspace.
                </p>
              </div>

            </div>

            <div className="flex items-center gap-4">

              <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/5">
                <MapPinned size={21} className="text-emerald-400" />
              </div>

              <div>
                <h3 className="text-sm font-semibold">
                  Rivers State Coverage
                </h3>

                <p className="mt-1 text-xs text-slate-400">
                  Access information relevant to local polling units.
                </p>
              </div>

            </div>

            <div className="flex items-center gap-4">

              <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/5">
                <BarChart3 size={21} className="text-emerald-400" />
              </div>

              <div>
                <h3 className="text-sm font-semibold">
                  Election Monitoring Insights
                </h3>

                <p className="mt-1 text-xs text-slate-400">
                  Explore structured agent-submitted data.
                </p>
              </div>

            </div>

          </div>

        </div>

        {/* LEFT FOOTER */}

        <div className="relative z-10 flex items-center justify-between border-t border-white/10 px-12 py-7 text-xs text-slate-400 xl:px-20">

          <span>
            © {new Date().getFullYear()} Dumo Youth Network
          </span>

          <span>
            Unofficial — Agent-Submitted Data
          </span>

        </div>

      </div>

      {/* =====================================
          RIGHT PANEL — REGISTRATION
      ===================================== */}

      <div className="flex min-h-screen flex-col bg-white">

        {/* MOBILE BRAND */}

        <div className="flex items-center gap-3 border-b border-slate-100 px-6 py-5 lg:hidden">

          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white">
            <Activity size={21} />
          </div>

          <div>
            <h1 className="text-sm font-extrabold text-slate-900">
              DUMO YOUTH NETWORK
            </h1>

            <p className="text-[10px] font-semibold tracking-widest text-emerald-600">
              ELECTION MONITORING
            </p>
          </div>

        </div>

        {/* FORM CONTAINER */}

        <div className="flex flex-1 items-center justify-center px-6 py-12 sm:px-10 lg:px-12 xl:px-20">

          <div className="w-full max-w-[440px]">

            {/* TOP ICON */}

            <div className="mb-7 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
              <Fingerprint size={29} strokeWidth={1.8} />
            </div>

            {/* HEADING */}

            <div className="mb-8">

              <div className="mb-3 flex items-center gap-2">

                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />

                <span className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">
                  Create Your Account
                </span>

              </div>

              <h2 className="text-4xl font-bold tracking-tight text-slate-900">
                Get started
              </h2>

              <p className="mt-3 text-sm leading-6 text-slate-500">
                Create your observer account to access
                the Dumo Youth Network monitoring workspace.
              </p>

            </div>

            {/* ERROR MESSAGE */}

            {error && (
              <div
                role="alert"
                className="mb-6 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4"
              >

                <AlertCircle
                  size={19}
                  className="mt-0.5 shrink-0 text-red-600"
                />

                <div>
                  <p className="text-sm font-semibold text-red-800">
                    Registration unsuccessful
                  </p>

                  <p className="mt-1 text-sm text-red-700">
                    {error}
                  </p>
                </div>

              </div>
            )}

            {/* REGISTRATION FORM */}

            <form onSubmit={handleSubmit} className="space-y-5">

              {/* FULL NAME */}

              <div>

                <label
                  htmlFor="fullName"
                  className="mb-2 block text-sm font-semibold text-slate-800"
                >
                  Full name
                </label>

                <div className="relative">

                  <UserRound
                    size={19}
                    className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                  />

                  <input
                    id="fullName"
                    name="fullName"
                    type="text"
                    autoComplete="name"
                    required
                    minLength={2}
                    disabled={loading}
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Enter your full name"
                    className={inputClass}
                  />

                </div>

              </div>

              {/* EMAIL */}

              <div>

                <label
                  htmlFor="registerEmail"
                  className="mb-2 block text-sm font-semibold text-slate-800"
                >
                  Email address
                </label>

                <div className="relative">

                  <Mail
                    size={19}
                    className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                  />

                  <input
                    id="registerEmail"
                    name="email"
                    type="email"
                    autoComplete="email"
                    inputMode="email"
                    required
                    disabled={loading}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@example.com"
                    className={inputClass}
                  />

                </div>

              </div>

              {/* PASSWORD */}

              <div>

                <label
                  htmlFor="registerPassword"
                  className="mb-2 block text-sm font-semibold text-slate-800"
                >
                  Password
                </label>

                <div className="relative">

                  <LockKeyhole
                    size={19}
                    className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                  />

                  <input
                    id="registerPassword"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    required
                    minLength={12}
                    disabled={loading}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Create a secure password"
                    aria-describedby="password-requirements"
                    className={`${inputClass} pr-14`}
                  />

                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={
                      showPassword
                        ? "Hide password"
                        : "Show password"
                    }
                    aria-pressed={showPassword}
                    className="absolute right-4 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 transition hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500"
                  >
                    {showPassword ? (
                      <EyeOff size={19} />
                    ) : (
                      <Eye size={19} />
                    )}
                  </button>

                </div>

                {/* PASSWORD STRENGTH */}

                {password.length > 0 && (
                  <div
                    id="password-requirements"
                    className="mt-4 rounded-xl border border-slate-100 bg-slate-50 p-4"
                  >

                    <div className="mb-3 flex items-center justify-between">

                      <span className="text-xs font-semibold text-slate-600">
                        Password requirements
                      </span>

                      <span
                        className={`text-xs font-bold ${strengthTextColor}`}
                      >
                        {passwordStrength}
                      </span>

                    </div>

                    {/* STRENGTH BARS */}

                    <div className="mb-4 grid grid-cols-5 gap-1.5">

                      {Array.from({ length: 5 }).map((_, index) => (
                        <div
                          key={index}
                          className={`h-1.5 rounded-full transition-colors ${
                            index < passwordScore
                              ? strengthColor
                              : "bg-slate-200"
                          }`}
                        />
                      ))}

                    </div>

                    {/* REQUIREMENTS */}

                    <div className="grid gap-2 sm:grid-cols-2">

                      {passwordChecks.map((check) => (
                        <div
                          key={check.label}
                          className="flex items-center gap-2"
                        >

                          <CheckCircle2
                            size={14}
                            className={
                              check.valid
                                ? "text-emerald-600"
                                : "text-slate-300"
                            }
                          />

                          <span
                            className={`text-xs ${
                              check.valid
                                ? "text-emerald-700"
                                : "text-slate-500"
                            }`}
                          >
                            {check.label}
                          </span>

                        </div>
                      ))}

                    </div>

                  </div>
                )}

              </div>

              {/* CONFIRM PASSWORD */}

              <div>

                <label
                  htmlFor="confirmPassword"
                  className="mb-2 block text-sm font-semibold text-slate-800"
                >
                  Confirm password
                </label>

                <div className="relative">

                  <LockKeyhole
                    size={19}
                    className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                  />

                  <input
                    id="confirmPassword"
                    name="confirmPassword"
                    type={
                      showConfirmPassword
                        ? "text"
                        : "password"
                    }
                    autoComplete="new-password"
                    required
                    disabled={loading}
                    value={confirmPassword}
                    onChange={(e) =>
                      setConfirmPassword(e.target.value)
                    }
                    placeholder="Re-enter your password"
                    aria-invalid={
                      confirmPassword.length > 0 &&
                      !passwordsMatch
                    }
                    className={`${inputClass} pr-14 ${
                      confirmPassword.length > 0
                        ? passwordsMatch
                          ? "border-emerald-300"
                          : "border-red-300"
                        : ""
                    }`}
                  />

                  <button
                    type="button"
                    onClick={() =>
                      setShowConfirmPassword(!showConfirmPassword)
                    }
                    aria-label={
                      showConfirmPassword
                        ? "Hide confirmation password"
                        : "Show confirmation password"
                    }
                    aria-pressed={showConfirmPassword}
                    className="absolute right-4 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 transition hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500"
                  >
                    {showConfirmPassword ? (
                      <EyeOff size={19} />
                    ) : (
                      <Eye size={19} />
                    )}
                  </button>

                </div>

                {/* PASSWORD MATCH FEEDBACK */}

                {confirmPassword.length > 0 && (
                  <p
                    className={`mt-2 flex items-center gap-2 text-xs font-medium ${
                      passwordsMatch
                        ? "text-emerald-600"
                        : "text-red-600"
                    }`}
                  >
                    {passwordsMatch ? (
                      <>
                        <CheckCircle2 size={14} />
                        Passwords match
                      </>
                    ) : (
                      <>
                        <AlertCircle size={14} />
                        Passwords do not match
                      </>
                    )}
                  </p>
                )}

              </div>

              {/* SUBMIT BUTTON */}

              <button
                type="submit"
                disabled={loading}
                className="group flex h-14 w-full items-center justify-center gap-3 rounded-xl bg-emerald-600 px-5 text-sm font-bold text-white shadow-lg shadow-emerald-600/15 transition hover:bg-emerald-700 hover:shadow-emerald-600/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
              >

                {loading ? (
                  <>
                    <LoaderCircle
                      size={19}
                      className="animate-spin"
                    />
                    Creating your account...
                  </>
                ) : (
                  <>
                    Create observer account

                    <ArrowRight
                      size={19}
                      className="transition-transform group-hover:translate-x-1"
                    />
                  </>
                )}

              </button>

            </form>

            {/* SIGN-IN LINK */}

            <div className="mt-8 border-t border-slate-100 pt-7 text-center">

              <p className="text-sm text-slate-500">
                Already have an account?{" "}
                <Link
                  to="/login"
                  className="font-bold text-emerald-700 transition hover:text-emerald-800"
                >
                  Sign in
                </Link>
              </p>

            </div>

            {/* SECURITY NOTE */}

            <div className="mt-8 flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50 p-4">

              <ShieldCheck
                size={19}
                className="mt-0.5 shrink-0 text-emerald-600"
              />

              <p className="text-xs leading-5 text-slate-500">
                New accounts are created with observer access.
                Additional monitoring permissions are managed
                separately by platform administrators.
              </p>

            </div>

          </div>

        </div>

        {/* RIGHT FOOTER */}

        <footer className="border-t border-slate-100 px-6 py-5 text-center">

          <p className="text-xs text-slate-400">
            © {new Date().getFullYear()} Dumo Youth Network.
            Unofficial — Agent-Submitted Data.
          </p>

        </footer>

      </div>

    </div>
  );
}