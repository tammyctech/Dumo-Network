import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function ProtectedRoute() {
  const { user, token, isLoading, authError } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6 text-center">
        <div>
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-emerald-200 border-t-emerald-700" />
          <p className="mt-4 text-sm font-semibold text-slate-600">Restoring your secure session…</p>
        </div>
      </div>
    );
  }

  if (authError && token && !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="max-w-md rounded-2xl border border-amber-200 bg-white p-7 text-center shadow-sm">
          <h1 className="text-xl font-black text-slate-950">Unable to restore session</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">{authError}</p>
          <button type="button" onClick={() => window.location.reload()} className="mt-5 rounded-xl bg-emerald-700 px-5 py-3 text-sm font-bold text-white">Try again</button>
        </div>
      </div>
    );
  }

  if (!user || !token) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
