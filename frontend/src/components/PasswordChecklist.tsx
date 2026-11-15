import { CheckCircle2, Circle } from "lucide-react";

export default function PasswordChecklist({password,confirm,current}:{password:string;confirm:string;current?:string}){
  const rules=[
    {label:"At least 8 characters",valid:password.length>=8},
    {label:"No more than 128 characters",valid:password.length>0&&password.length<=128},
    ...(current!==undefined?[{label:"Different from current password",valid:password.length>0&&password!==current}]:[]),
    {label:"Passwords match",valid:confirm.length>0&&password===confirm},
  ];
  return <div className="rounded-xl border border-slate-200 bg-slate-50 p-4" aria-live="polite"><p className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">Password requirements</p><div className="space-y-2">{rules.map(rule=><div key={rule.label} className={`flex items-center gap-2 text-sm ${rule.valid?"text-emerald-800":"text-slate-500"}`}>{rule.valid?<CheckCircle2 size={17} className="shrink-0 text-emerald-700"/>:<Circle size={17} className="shrink-0 text-slate-300"/>}<span>{rule.label}</span></div>)}</div></div>;
}
