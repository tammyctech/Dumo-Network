import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { KeyRound, LoaderCircle } from "lucide-react";
import { requestPasswordReset } from "../services/api";

export default function ForgotPassword(){
 const [email,setEmail]=useState(""),[message,setMessage]=useState(""),[error,setError]=useState(""),[busy,setBusy]=useState(false);
 async function submit(e:FormEvent){e.preventDefault();setBusy(true);setError("");try{const result=await requestPasswordReset(email.trim().toLowerCase());setMessage(result.message)}catch(x){setError(x instanceof Error?x.message:"Unable to request a reset link.")}finally{setBusy(false)}}
 return <main className="flex min-h-screen items-center justify-center bg-slate-50 p-5"><section className="w-full max-w-md rounded-3xl border bg-white p-8 shadow-xl"><KeyRound className="text-emerald-700" size={34}/><h1 className="mt-5 text-3xl font-black">Forgot your password?</h1><p className="mt-3 text-sm text-slate-600">Enter your registered email address. We will email a reset link that expires after 30 minutes.</p>{message?<div className="mt-6 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">{message}</div>:<form onSubmit={submit} className="mt-6 space-y-4">{error&&<div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}<input required type="email" autoComplete="email" className="input" placeholder="you@example.com" value={email} onChange={e=>setEmail(e.target.value)}/><button disabled={busy} className="flex w-full justify-center gap-2 rounded-xl bg-emerald-700 px-5 py-3 font-bold text-white disabled:opacity-50">{busy&&<LoaderCircle className="animate-spin" size={18}/>}Send reset link</button></form>}<Link to="/login" className="mt-6 block text-center text-sm font-bold text-emerald-700">Return to login</Link></section></main>
}
