import { useEffect, useMemo, useState } from "react";
import { CheckSquare, History, MessageSquareText, Search, Send, Square } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useAppPrompt } from "../context/AppPrompt";

const API = import.meta.env.DEV ? (import.meta.env.VITE_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "") : "";
type Recipient = { id:number; full_name:string; phone_number:string; role:string; lga?:string|null };
type SmsHistory = { id:number; created_at:string; lga?:string|null; send_to_all:boolean; recipient_count:number; sent?:number|null; failed?:number|null; template_key?:string|null; external_recipient_count:number; status:"queued"|"completed" };
type SmsRequest = {
  message: string;
  template_key: string | null;
  send_to_all: boolean;
  lga: string | null;
  user_ids: number[];
  phone_numbers: string[];
};
const VOTE_AWARENESS_MESSAGE=`YOUR FUTURE IS WORTH MORE THAN ₦5,000 OR ₦10,000!

Dear Dumo Youth Network Members, as we approach the 2027 elections, remember that selling your vote means risking years of good governance for temporary financial gain. Your vote is your voice, your power, and your future. Say NO to vote buying. Together, let's build a better Rivers State.

Tell someone to tell someone to vote Chief Dumo Lulu-Briggs come February 6, 2027.

Tamunotonye Adokiye Emmanuel
Coordinator, DYN`;
async function detail(response:Response){try{const body=await response.json();return typeof body.detail==="string"?body.detail:`Request failed (${response.status}).`}catch{return `Request failed (${response.status}).`}}

export default function AdminSms(){
  const {token}=useAuth();
  const ask = useAppPrompt();
  const [recipients,setRecipients]=useState<Recipient[]>([]),[history,setHistory]=useState<SmsHistory[]>([]),[selected,setSelected]=useState<Set<number>>(new Set()),[sendAll,setSendAll]=useState(false),[lga,setLga]=useState(""),[search,setSearch]=useState(""),[externalPhone,setExternalPhone]=useState(""),[template,setTemplate]=useState(""),[message,setMessage]=useState(""),[loading,setLoading]=useState(true),[sending,setSending]=useState(false),[error,setError]=useState(""),[success,setSuccess]=useState("");
  const headers={Authorization:`Bearer ${token}`};
  async function loadHistory(){const response=await fetch(`${API}/api/admin/sms/history`,{headers});if(!response.ok)throw new Error(await detail(response));const data=await response.json();setHistory(data.history||[])}
  useEffect(()=>{let active=true;void(async()=>{try{const [recipientResponse,historyResponse]=await Promise.all([fetch(`${API}/api/admin/sms/recipients`,{headers}),fetch(`${API}/api/admin/sms/history`,{headers})]);if(!recipientResponse.ok)throw new Error(await detail(recipientResponse));if(!historyResponse.ok)throw new Error(await detail(historyResponse));const [recipientData,historyData]=await Promise.all([recipientResponse.json(),historyResponse.json()]);if(active){setRecipients(recipientData.recipients||[]);setHistory(historyData.history||[])}}catch(reason){if(active)setError(reason instanceof Error?reason.message:"Unable to load SMS information.")}finally{if(active)setLoading(false)}})();return()=>{active=false}},[token]);
  const lgas=useMemo(()=>[...new Set(recipients.map(item=>item.lga).filter((value):value is string=>Boolean(value)))].sort(),[recipients]);
  const audience=useMemo(()=>recipients.filter(item=>!lga||item.lga===lga),[recipients,lga]);
  const filtered=useMemo(()=>{const query=search.trim().toLowerCase();return audience.filter(item=>!query||`${item.full_name} ${item.phone_number} ${item.role} ${item.lga||""}`.toLowerCase().includes(query))},[audience,search]);
  function toggle(id:number){setSelected(current=>{const next=new Set(current);if(next.has(id))next.delete(id);else next.add(id);return next})}
  function toggleVisible(){setSelected(current=>{const next=new Set(current),all=filtered.length>0&&filtered.every(item=>next.has(item.id));filtered.forEach(item=>all?next.delete(item.id):next.add(item.id));return next})}
  async function requestConfirmation() {
    if (sending) return;
    setError("");
    setSuccess("");
    const typedPhone = externalPhone.trim();
    if (!template && !message.trim()) return setError("Enter a message or choose a template.");
    if (template === "assignment_login" && typedPhone) return setError("The login details template can only be sent to registered users.");
    const count = (sendAll ? audience.length : selected.size) + (typedPhone ? 1 : 0);
    if (!count) return setError("Select a recipient, enter a phone number, or choose send to all.");

    const request: SmsRequest = {
      message: template ? "" : message.trim(),
      template_key: template || null,
      send_to_all: sendAll,
      lga: sendAll && lga ? lga : null,
      user_ids: sendAll ? [] : [...selected],
      phone_numbers: typedPhone ? [typedPhone] : [],
    };
    const confirmed = await ask({
      title: "Confirm SMS",
      message: `Send this SMS to ${count} ${count === 1 ? "recipient" : "recipients"}${request.lga ? ` in ${request.lga} LGA` : ""}?`,
      confirmLabel: "Send SMS",
    });
    if (confirmed === null) return;
    setSending(true);
    try {
      const response = await fetch(`${API}/api/admin/sms/send`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      if (!response.ok) throw new Error(await detail(response));
      const data = await response.json();
      setSuccess(data.message || "SMS messages were queued.");
      setMessage("");
      setExternalPhone("");
      setTemplate("");
      setSelected(new Set());
      setSendAll(false);
      await loadHistory();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to send SMS messages.");
    } finally {
      setSending(false);
    }
  }

  return <div className="mx-auto max-w-6xl space-y-6 pb-12">
    <header><h1 className="flex items-center gap-3 text-3xl font-black"><MessageSquareText className="text-emerald-700"/>SMS Centre</h1><p className="mt-2 text-sm text-slate-600">Send an SMS to registered users or directly to any Nigerian mobile number.</p></header>
    {error&&<div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>}{success&&<div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800">{success}</div>}
    <div className="grid gap-6 lg:grid-cols-[1.15fr_.85fr]">
      <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
        <div className="space-y-4 border-b p-5">
          <label className="block text-sm font-bold text-slate-700">Filter audience by LGA<select value={lga} onChange={event=>{setLga(event.target.value);setSendAll(false);setSelected(new Set())}} className="input mt-2"><option value="">All LGAs and users</option>{lgas.map(name=><option key={name} value={name}>{name} LGA</option>)}</select></label>
          <label className="sms-send-all flex cursor-pointer items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 font-bold text-emerald-900"><input type="checkbox" checked={sendAll} onChange={event=>setSendAll(event.target.checked)} className="h-5 w-5 accent-emerald-600"/>Send to all {audience.length} eligible {lga?`users in ${lga} LGA`:"users"}</label>
          <div className="relative"><Search size={17} className="absolute left-3 top-3.5 text-slate-400"/><input value={search} onChange={event=>setSearch(event.target.value)} className="input pl-10" placeholder="Search by name, phone number, role, or LGA"/></div>
          <button type="button" onClick={toggleVisible} disabled={sendAll||!filtered.length} className="flex items-center gap-2 text-sm font-bold text-emerald-700 disabled:opacity-40">{filtered.length>0&&filtered.every(item=>selected.has(item.id))?<CheckSquare size={17}/>:<Square size={17}/>}Select or clear visible users</button>
        </div>
        <div className="max-h-[520px] overflow-auto">{loading?<p className="p-6 text-slate-500">Loading recipients…</p>:filtered.length===0?<p className="p-6 text-slate-500">No eligible users found.</p>:filtered.map(item=><label key={item.id} className={`flex cursor-pointer items-center gap-4 border-b px-5 py-4 last:border-0 ${sendAll?"opacity-60":"hover:bg-slate-50"}`}><input type="checkbox" disabled={sendAll} checked={sendAll||selected.has(item.id)} onChange={()=>toggle(item.id)} className="h-5 w-5"/><span className="min-w-0 flex-1"><strong className="block truncate">{item.full_name}</strong><span className="text-xs capitalize text-slate-500">{item.role}{item.lga?` · ${item.lga} LGA`:""}</span></span><span className="text-sm text-slate-600">{item.phone_number}</span></label>)}</div>
      </section>
      <section className="h-fit rounded-2xl border bg-white p-5 shadow-sm lg:sticky lg:top-6">
        <h2 className="font-black">Compose message</h2><p className="mt-1 text-sm text-slate-500">Recipients: {sendAll?audience.length:selected.size}{sendAll&&lga?` in ${lga} LGA`:""}</p>
        <label className="mt-4 block text-sm font-bold text-slate-700">Send to another phone number<input type="tel" inputMode="tel" autoComplete="tel" value={externalPhone} onChange={event=>setExternalPhone(event.target.value)} disabled={template==="assignment_login"} className="input mt-2 disabled:bg-slate-100" placeholder="e.g. 0801 234 5678"/><span className="mt-1 block text-xs font-normal text-slate-500">The person does not need to be a registered agent.</span></label>
        <label className="mt-4 block text-sm font-bold text-slate-700">Message template<select value={template} onChange={event=>setTemplate(event.target.value)} className="input mt-2"><option value="">Custom message</option><option value="vote_awareness">Vote awareness — your future</option><option value="assignment_login">Polling unit and login details</option></select></label>
        {template==="assignment_login"?<div className="mt-4 rounded-xl border bg-slate-50 p-4 text-sm leading-6 text-slate-700"><strong>Personalized preview</strong><p className="mt-2">Hello [first name]. Your Dumo Youth Network polling unit: [code, name, ward, LGA]. Login phone: [phone]. Sign in: [login link]. Temporary password: 12345 (only for accounts that have not changed it); otherwise use the existing password.</p></div>:template==="vote_awareness"?<div className="mt-4 whitespace-pre-wrap rounded-xl border bg-slate-50 p-4 text-sm leading-6 text-slate-700"><strong className="block pb-2">Template preview</strong>{VOTE_AWARENESS_MESSAGE}</div>:<><textarea value={message} onChange={event=>setMessage(event.target.value.slice(0,1000))} rows={9} maxLength={1000} className="input mt-4 resize-y" placeholder="Type your SMS message…"/><div className="mt-2 flex justify-between text-xs text-slate-500"><span>Long messages may use multiple SMS units.</span><span>{message.length}/1000</span></div></>}
        <button type="button" onClick={requestConfirmation} disabled={sending||loading||(!template&&!message.trim())||(!sendAll&&!selected.size&&!externalPhone.trim())} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 py-3 font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"><Send size={18}/>{sending?"Sending…":"Send SMS"}</button>
        <p className="mt-3 text-xs leading-5 text-slate-500">You will be asked to confirm before delivery. Temporary passwords are sent only to users who must still change them.</p>
      </section>
    </div>
    <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
      <div className="border-b p-5"><h2 className="flex items-center gap-2 font-black"><History size={19} className="text-emerald-700"/>SMS history</h2><p className="mt-1 text-sm text-slate-500">The latest 50 sends, including the LGA and delivery result.</p></div>
      {history.length===0?<p className="p-6 text-slate-500">No SMS history yet.</p>:<div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-5 py-3">Date</th><th className="px-5 py-3">Audience / LGA</th><th className="px-5 py-3">Message</th><th className="px-5 py-3">Recipients</th><th className="px-5 py-3">Status</th></tr></thead><tbody>{history.map(item=><tr key={item.id} className="border-t"><td className="whitespace-nowrap px-5 py-4">{new Intl.DateTimeFormat("en-NG",{dateStyle:"medium",timeStyle:"short",timeZone:"Africa/Lagos"}).format(new Date(item.created_at))}</td><td className="px-5 py-4 font-semibold">{item.lga?`${item.lga} LGA`:item.send_to_all?"All LGAs":"Selected users / direct number"}</td><td className="px-5 py-4">{item.template_key==="vote_awareness"?"Vote awareness":item.template_key==="assignment_login"?"Login details":"Custom message"}</td><td className="px-5 py-4">{item.recipient_count}</td><td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${item.failed?"bg-amber-100 text-amber-800":item.status==="completed"?"bg-emerald-100 text-emerald-800":"bg-blue-100 text-blue-800"}`}>{item.status==="queued"?"Queued":item.failed?`${item.sent||0} sent · ${item.failed} failed`:`${item.sent??item.recipient_count} sent`}</span></td></tr>)}</tbody></table></div>}
    </section>
  </div>
}
