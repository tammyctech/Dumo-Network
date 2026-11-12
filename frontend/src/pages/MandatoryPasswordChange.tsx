import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { KeyRound, LoaderCircle, ShieldCheck } from "lucide-react";
import { changePassword } from "../services/api";
import { useAuth } from "../context/AuthContext";

export default function MandatoryPasswordChange() {
  const { token, logout } = useAuth();
  const navigate = useNavigate();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault(); setError("");
    if (!token) return;
    if (next !== confirm) { setError("New passwords do not match."); return; }
    setLoading(true);
    try {
      await changePassword(token, { current_password: current, new_password: next, confirm_password: confirm });
      logout();
      navigate("/login", { replace: true, state: { passwordChanged: true } });
    } catch (value) { setError(value instanceof Error ? value.message : "Unable to change password."); }
    finally { setLoading(false); }
  }

  return <main className="flex min-h-screen items-center justify-center bg-slate-50 p-5">
    <section className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-7 shadow-xl sm:p-10">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700"><KeyRound /></div>
      <h1 className="mt-6 text-3xl font-black text-slate-950">Create your private password</h1>
      <p className="mt-3 text-sm leading-6 text-slate-600">Your temporary credential can only unlock this page. Set a new password, then sign in again to access election features.</p>
      {error && <p role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <form onSubmit={submit} className="mt-7 space-y-5">
        {[{label:"Temporary password", value:current, set:setCurrent, auto:"current-password"}, {label:"New password", value:next, set:setNext, auto:"new-password"}, {label:"Confirm new password", value:confirm, set:setConfirm, auto:"new-password"}].map(field =>
          <label key={field.label} className="block text-sm font-bold text-slate-800">{field.label}
            <input type="password" required minLength={field.label === "Temporary password" ? undefined : 8} autoComplete={field.auto} value={field.value} onChange={e=>field.set(e.target.value)} className="mt-2 h-13 w-full rounded-xl border border-slate-200 px-4 outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100" />
          </label>)}
        <button disabled={loading} className="flex h-13 w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 font-bold text-white disabled:opacity-60">{loading && <LoaderCircle className="animate-spin" size={18}/>}Change password and sign out</button>
      </form>
      <p className="mt-6 flex gap-2 text-xs leading-5 text-slate-500"><ShieldCheck className="shrink-0 text-emerald-700" size={18}/>All existing sessions are invalidated after this change.</p>
    </section>
  </main>;
}
