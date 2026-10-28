import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";

import {
  Activity,
  ArrowRight,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  ShieldCheck,
  MapPinned,
  CheckCircle2,
  AlertCircle,
  LoaderCircle,
  Fingerprint,
} from "lucide-react";

import { useAuth } from "../context/AuthContext";

export default function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [showPassword, setShowPassword] = useState(false);

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (loading) return;

    setError("");
    setLoading(true);

    try {
      await login(email.trim(), password);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to sign in. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#F5F7FA] lg:grid lg:grid-cols-2">

      {/* ==========================================
          LEFT PANEL — BRAND EXPERIENCE
      ========================================== */}

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

        {/* MAIN BRAND CONTENT */}

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

            Empowering

            <br />

            Communities.

            <br />

            <span className="text-emerald-400">
              Strengthening
            </span>

            <br />

            Transparency.

          </h2>

          <p className="mt-8 max-w-lg text-base leading-8 text-slate-300">
            A dedicated digital workspace for election monitoring,
            polling-unit reporting, and community participation
            across Rivers State.
          </p>

          {/* FEATURE LIST */}

          <div className="mt-12 space-y-5">

            <div className="flex items-center gap-4">

              <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/5">
                <MapPinned size={21} className="text-emerald-400" />
              </div>

              <div>
                <h3 className="text-sm font-semibold">
                  Polling-Unit Monitoring
                </h3>

                <p className="mt-1 text-xs text-slate-400">
                  Organised reporting across Rivers State.
                </p>
              </div>

            </div>

            <div className="flex items-center gap-4">

              <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/5">
                <ShieldCheck size={21} className="text-emerald-400" />
              </div>

              <div>
                <h3 className="text-sm font-semibold">
                  Role-Based Access
                </h3>

                <p className="mt-1 text-xs text-slate-400">
                  Dedicated tools for authorised platform users.
                </p>
              </div>

            </div>

            <div className="flex items-center gap-4">

              <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/5">
                <CheckCircle2 size={21} className="text-emerald-400" />
              </div>

              <div>
                <h3 className="text-sm font-semibold">
                  Structured Result Reporting
                </h3>

                <p className="mt-1 text-xs text-slate-400">
                  Clear records of agent-submitted election data.
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

      {/* ==========================================
          RIGHT PANEL — LOGIN FORM
      ========================================== */}

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

            <div className="mb-8 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
              <Fingerprint size={29} strokeWidth={1.8} />
            </div>

            {/* HEADING */}

            <div className="mb-9">

              <div className="mb-3 flex items-center gap-2">

                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />

                <span className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">
                  Secure Workspace Access
                </span>

              </div>

              <h2 className="text-4xl font-bold tracking-tight text-slate-900">
                Welcome back
              </h2>

              <p className="mt-3 text-sm leading-6 text-slate-500">
                Sign in to access your election monitoring dashboard.
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
                    Sign-in unsuccessful
                  </p>

                  <p className="mt-1 text-sm text-red-700">
                    {error}
                  </p>
                </div>

              </div>
            )}

            {/* LOGIN FORM */}

            <form onSubmit={handleSubmit} className="space-y-6">

              {/* EMAIL */}

              <div>

                <label
                  htmlFor="email"
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
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    inputMode="email"
                    required
                    disabled={loading}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@example.com"
                    className="h-14 w-full rounded-xl border border-slate-200 bg-slate-50/60 pl-12 pr-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-500/10 disabled:opacity-60"
                  />

                </div>

              </div>

              {/* PASSWORD */}

              <div>

                <label
                  htmlFor="password"
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
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    disabled={loading}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="h-14 w-full rounded-xl border border-slate-200 bg-slate-50/60 pl-12 pr-14 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-500/10 disabled:opacity-60"
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

              </div>

              {/* SIGN IN BUTTON */}

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
                    Signing you in...
                  </>
                ) : (
                  <>
                    Sign in to workspace

                    <ArrowRight
                      size={19}
                      className="transition-transform group-hover:translate-x-1"
                    />
                  </>
                )}

              </button>

            </form>

            {/* DIVIDER */}

            <div className="my-9 flex items-center gap-4">

              <div className="h-px flex-1 bg-slate-200" />

              <span className="text-xs font-medium text-slate-400">
                NEW TO DUMO NETWORK?
              </span>

              <div className="h-px flex-1 bg-slate-200" />

            </div>

            {/* REGISTER LINK */}

            <Link
              to="/register"
              className="flex h-14 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-800 transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
            >
              Create an account
              <ArrowRight size={17} />
            </Link>

            {/* SECURITY NOTE */}

            <div className="mt-9 flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50 p-4">

              <ShieldCheck
                size={19}
                className="mt-0.5 shrink-0 text-emerald-600"
              />

              <p className="text-xs leading-5 text-slate-500">
                Access to election monitoring tools is controlled
                by your assigned account role. Never share your
                login credentials with another person.
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