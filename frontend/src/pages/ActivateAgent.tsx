import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, CheckCircle2, Eye, EyeOff, KeyRound, Loader2, LockKeyhole, ShieldCheck, XCircle } from "lucide-react";

const API_URL = (import.meta.env.VITE_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
type ActivationStatus = "ready" | "submitting" | "success" | "error";

export default function ActivateAgent() {
  const navigate = useNavigate();
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [status, setStatus] = useState<ActivationStatus>("ready");
  const [error, setError] = useState("");

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const hash = window.location.hash.replace(/^#/, "");
    const hashQuery = hash.includes("?") ? hash.split("?").slice(1).join("?") : hash;
    const hashParams = new URLSearchParams(hashQuery);
    const invitationToken = query.get("token") || hashParams.get("token");

    if (invitationToken?.trim()) {
      setToken(invitationToken.trim());
      setStatus("ready");
      setError("");
    } else {
      setStatus("error");
      setError("This activation link does not contain a token. Request a new link from your administrator.");
    }

    // Avoid leaving a sensitive invitation token in browser history/address bar.
    window.history.replaceState(window.history.state, "", window.location.pathname);
  }, []);

  const rules = [
    { label: "At least 12 characters", valid: password.length >= 12 },
    { label: "An uppercase letter", valid: /[A-Z]/.test(password) },
    { label: "A lowercase letter", valid: /[a-z]/.test(password) },
    { label: "A number", valid: /\d/.test(password) },
    { label: "A special character", valid: /[^A-Za-z0-9]/.test(password) },
  ];
  const passwordIsValid = rules.every((rule) => rule.valid) && password.length <= 128;
  const isSubmitting = status === "submitting";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!token) {
      setError("Missing activation token. Request a new activation link.");
      return;
    }
    if (!passwordIsValid) {
      setError("Please meet all password requirements.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setStatus("submitting");
    try {
      const response = await fetch(`${API_URL}/api/agents/activate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data: { detail?: unknown; message?: unknown } = await response.json().catch(() => ({}));
      if (!response.ok) {
        const detail = typeof data.detail === "string" ? data.detail : null;
        if (response.status === 404 || response.status === 405) {
          throw new Error("The activation service is unavailable (HTTP " + response.status + "). Ask the administrator to check the backend route /api/agents/activate.");
        }
        throw new Error(detail || `Activation failed (HTTP ${response.status}).`);
      }
      setToken("");
      setPassword("");
      setConfirmPassword("");
      setStatus("success");
    } catch (err) {
      setStatus("error");
      setError(err instanceof TypeError ? "Cannot reach the activation server. Check that the backend is running and the API URL/CORS settings are correct." : err instanceof Error ? err.message : "An unexpected error occurred.");
    }
  }

  return (
    <main className="min-h-screen bg-[#071521] px-4 py-12 text-white sm:px-6">
      <div className="mx-auto w-full max-w-md">
        <header className="mb-8 text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-emerald-400/20 bg-emerald-400/10">
            <ShieldCheck className="h-8 w-8 text-emerald-400" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Dumo Network</h1>
          <p className="mt-2 text-sm text-slate-400">Secure Polling-Unit Agent Activation</p>
        </header>

        <section className="rounded-3xl border border-white/10 bg-[#102332] p-6 shadow-2xl sm:p-8">
          {status === "success" ? (
            <div className="py-7 text-center">
              <CheckCircle2 className="mx-auto mb-5 h-16 w-16 text-emerald-400" />
              <h2 className="text-2xl font-semibold">Account Activated!</h2>
              <p className="mt-4 text-sm leading-6 text-slate-300">Your agent account is now active. Sign in with your email address and new password.</p>
              <button type="button" onClick={() => navigate("/login")} className="mt-8 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 py-3 font-semibold text-[#071521] hover:bg-emerald-400">
                Continue to Login <ArrowRight className="h-5 w-5" />
              </button>
            </div>
          ) : (
            <>
              <div className="mb-7">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-400/10"><KeyRound className="h-6 w-6 text-emerald-400" /></div>
                <h2 className="text-2xl font-semibold">Activate Your Account</h2>
                <p className="mt-2 text-sm leading-6 text-slate-400">Create a secure password to activate your polling-unit agent account.</p>
              </div>

              {error && <div role="alert" className="mb-6 flex gap-3 rounded-xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-300"><XCircle className="h-5 w-5 shrink-0" /><span>{error}</span></div>}

              {token && (
                <form onSubmit={handleSubmit} className="space-y-5">
                  <div>
                    <label htmlFor="password" className="mb-2 block text-sm font-medium text-slate-200">New Password</label>
                    <div className="relative">
                      <LockKeyhole className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" />
                      <input id="password" type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Create a strong password" autoComplete="new-password" required minLength={12} maxLength={128} disabled={isSubmitting} className="w-full rounded-xl border border-white/10 bg-[#071521] py-3 pl-12 pr-12 text-white outline-none placeholder:text-slate-500 focus:border-emerald-400" />
                      <button type="button" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? "Hide password" : "Show password"} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white">{showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}</button>
                    </div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-[#071521]/60 p-4">
                    <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Password Requirements</p>
                    <div className="space-y-2">{rules.map((rule) => <div key={rule.label} className="flex items-center gap-2 text-xs"><CheckCircle2 className={`h-4 w-4 ${rule.valid ? "text-emerald-400" : "text-slate-600"}`} /><span className={rule.valid ? "text-emerald-300" : "text-slate-400"}>{rule.label}</span></div>)}</div>
                  </div>
                  <div>
                    <label htmlFor="confirmPassword" className="mb-2 block text-sm font-medium text-slate-200">Confirm Password</label>
                    <div className="relative">
                      <LockKeyhole className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" />
                      <input id="confirmPassword" type={showConfirmPassword ? "text" : "password"} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Re-enter your password" autoComplete="new-password" required disabled={isSubmitting} className="w-full rounded-xl border border-white/10 bg-[#071521] py-3 pl-12 pr-12 text-white outline-none placeholder:text-slate-500 focus:border-emerald-400" />
                      <button type="button" onClick={() => setShowConfirmPassword((v) => !v)} aria-label={showConfirmPassword ? "Hide confirmation password" : "Show confirmation password"} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white">{showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}</button>
                    </div>
                  </div>
                  <button type="submit" disabled={isSubmitting || !passwordIsValid || password !== confirmPassword} className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 py-3 font-semibold text-[#071521] hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50">
                    {isSubmitting ? <><Loader2 className="h-5 w-5 animate-spin" /> Activating Account...</> : <>Activate Account <ArrowRight className="h-5 w-5" /></>}
                  </button>
                </form>
              )}
            </>
          )}
        </section>
        <div className="mt-6 text-center"><Link to="/login" className="text-sm font-medium text-emerald-400 hover:text-emerald-300">Return to Login</Link></div>
        <p className="mt-8 text-center text-xs leading-5 text-slate-500">Agent accounts are created by authorized administrators only. Never share your activation link or password.</p>
      </div>
    </main>
  );
}
