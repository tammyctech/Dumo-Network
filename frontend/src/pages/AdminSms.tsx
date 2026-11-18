import { useEffect, useMemo, useState } from "react";
import { CheckSquare, MessageSquareText, Search, Send, Square } from "lucide-react";
import { useAuth } from "../context/AuthContext";

const API = import.meta.env.DEV ? (import.meta.env.VITE_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "") : "";
type Recipient = { id:number; full_name:string; phone_number:string; role:string; lga?:string|null };
async function detail(response:Response){try{const body=await response.json();return typeof body.detail==="string"?body.detail:`Request failed (${response.status}).`}catch{return `Request failed (${response.status}).`}}

export default function AdminSms(){
  const {token}=useAuth();
  const [recipients,setRecipients]=useState<Recipient[]>([]),[selected,setSelected]=useState<Set<number>>(new Set()),[sendAll,setSendAll]=useState(false),[lga,setLga]=useState(""),[search,setSearch]=useState(""),[template,setTemplate]=useState(""),[message,setMessage]=useState(""),[loading,setLoading]=useState(true),[sending,setSending]=useState(false),[error,setError]=useState(""),[success,setSuccess]=useState("");
  const headers={Authorization:`Bearer ${token}`};
  useEffect(()=>{let active=true;void(async()=>{try{const response=await fetch(`${API}/api/admin/sms/recipients`,{headers});if(!response.ok)throw new Error(await detail(response));const data=await response.json();if(active)setRecipients(data.recipients||[])}catch(reason){if(active)setError(reason instanceof Error?reason.message:"Unable to load SMS recipients.")}finally{if(active)setLoading(false)}})();return()=>{active=false}},[token]);
  const lgas=useMemo(()=>[...new Set(recipients.map(item=>item.lga).filter((value):value is string=>Boolean(value)))].sort(),[recipients]);
  const audience=useMemo(()=>recipients.filter(item=>!lga||item.lga===lga),[recipients,lga]);
  const filtered=useMemo(()=>{const query=search.trim().toLowerCase();return audience.filter(item=>!query||`${item.full_name} ${item.phone_number} ${item.role} ${item.lga||""}`.toLowerCase().includes(query))},[audience,search]);
  function toggle(id:number){setSelected(current=>{const next=new Set(current);if(next.has(id))next.delete(id);else next.add(id);return next})}
  function toggleVisible(){setSelected(current=>{const next=new Set(current),all=filtered.length>0&&filtered.every(item=>next.has(item.id));filtered.forEach(item=>all?next.delete(item.id):next.add(item.id));return next})}
  async function submit(){setError("");setSuccess("");if(!template&&!message.trim())return setError("Enter a message or choose a template.");if(!sendAll&&!selected.size)return setError("Select at least one recipient or choose send to all.");const count=sendAll?audience.length:selected.size;if(!window.confirm(`Queue this SMS for ${count} recipient(s)${sendAll&&lga?` in ${lga} LGA`:""}?`))return;setSending(true);try{const response=await fetch(`${API}/api/admin/sms/send`,{method:"POST",headers:{...headers,"Content-Type":"application/json"},body:JSON.stringify({message:template?"":message.trim(),template_key:template||null,send_to_all:sendAll,lga:sendAll&&lga?lga:null,user_ids:sendAll?[]:[...selected]})});if(!response.ok)throw new Error(await detail(response));const data=await response.json();setSuccess(data.message||"SMS messages were queued.");setMessage("");setTemplate("");setSelected(new Set());setSendAll(false)}catch(reason){setError(reason instanceof Error?reason.message:"Unable to send SMS messages.")}finally{setSending(false)}}

  return <div className="mx-auto max-w-6xl space-y-6 pb-12">
    <header><h1 className="flex items-center gap-3 text-3xl font-black"><MessageSquareText className="text-emerald-700"/>SMS Centre</h1><p className="mt-2 text-sm text-slate-600">Send an SMS to selected active users, a particular LGA, or everyone.</p></header>
    {error&&<div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>}{success&&<div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800">{success}</div>}
    <div className="grid gap-6 lg:grid-cols-[1.15fr_.85fr]">
      <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
        <div className="space-y-4 border-b p-5">
          <label className="block text-sm font-bold text-slate-700">Filter audience by LGA<select value={lga} onChange={event=>{setLga(event.target.value);setSendAll(false);setSelected(new Set())}} className="input mt-2"><option value="">All LGAs and users</option>{lgas.map(name=><option key={name} value={name}>{name} LGA</option>)}</select></label>
          <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 font-bold text-emerald-900"><input type="checkbox" checked={sendAll} onChange={event=>setSendAll(event.target.checked)} className="h-5 w-5"/>Send to all {audience.length} eligible {lga?`users in ${lga} LGA`:"users"}</label>
          <div className="relative"><Search size={17} className="absolute left-3 top-3.5 text-slate-400"/><input value={search} onChange={event=>setSearch(event.target.value)} className="input pl-10" placeholder="Search by name, phone number, role, or LGA"/></div>
          <button type="button" onClick={toggleVisible} disabled={sendAll||!filtered.length} className="flex items-center gap-2 text-sm font-bold text-emerald-700 disabled:opacity-40">{filtered.length>0&&filtered.every(item=>selected.has(item.id))?<CheckSquare size={17}/>:<Square size={17}/>}Select or clear visible users</button>
        </div>
        <div className="max-h-[520px] overflow-auto">{loading?<p className="p-6 text-slate-500">Loading recipients…</p>:filtered.length===0?<p className="p-6 text-slate-500">No eligible users found.</p>:filtered.map(item=><label key={item.id} className={`flex cursor-pointer items-center gap-4 border-b px-5 py-4 last:border-0 ${sendAll?"opacity-60":"hover:bg-slate-50"}`}><input type="checkbox" disabled={sendAll} checked={sendAll||selected.has(item.id)} onChange={()=>toggle(item.id)} className="h-5 w-5"/><span className="min-w-0 flex-1"><strong className="block truncate">{item.full_name}</strong><span className="text-xs capitalize text-slate-500">{item.role}{item.lga?` · ${item.lga} LGA`:""}</span></span><span className="text-sm text-slate-600">{item.phone_number}</span></label>)}</div>
      </section>
      <section className="h-fit rounded-2xl border bg-white p-5 shadow-sm lg:sticky lg:top-6">
        <h2 className="font-black">Compose message</h2><p className="mt-1 text-sm text-slate-500">Recipients: {sendAll?audience.length:selected.size}{sendAll&&lga?` in ${lga} LGA`:""}</p>
        <label className="mt-4 block text-sm font-bold text-slate-700">Message template<select value={template} onChange={event=>setTemplate(event.target.value)} className="input mt-2"><option value="">Custom message</option><option value="assignment_login">Polling unit and login details</option></select></label>
        {template?<div className="mt-4 rounded-xl border bg-slate-50 p-4 text-sm leading-6 text-slate-700"><strong>Personalized preview</strong><p className="mt-2">Hello [name]. Your Dumo Youth Network polling unit: [code, name, ward, LGA]. Login phone: [phone]. Sign in: [login link]. Temporary password: 12345 (only for accounts that have not changed it); otherwise use the existing password.</p></div>:<><textarea value={message} onChange={event=>setMessage(event.target.value.slice(0,1000))} rows={9} maxLength={1000} className="input mt-4 resize-y" placeholder="Type your SMS message…"/><div className="mt-2 flex justify-between text-xs text-slate-500"><span>Long messages may use multiple SMS units.</span><span>{message.length}/1000</span></div></>}
        <button type="button" onClick={()=>void submit()} disabled={sending||loading||(!template&&!message.trim())||(!sendAll&&!selected.size)} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 py-3 font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"><Send size={18}/>{sending?"Queueing…":"Send SMS"}</button>
        <p className="mt-3 text-xs leading-5 text-slate-500">You will be asked to confirm before delivery. Temporary passwords are sent only to users who must still change them.</p>
      </section>
    </div>
  </div>
}
