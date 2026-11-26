import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  AlertCircle,
  BellRing,
  CheckCircle2,
  Clock3,
  Loader2,
  Megaphone,
  Mail,
  Radio,
  RefreshCw,
  Search,
  Send,
  Smartphone,
  Users,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useAppPrompt } from "../context/AppPrompt";

const API_URL = import.meta.env.DEV
  ? (import.meta.env.VITE_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "")
  : "";

type Agent = { id: number; full_name: string; email: string };
type Election = { id: number; name: string; election_date: string };
type Campaign = {
  id: number; title: string; body: string; url: string; audience_type: string;
  target_users: number; devices_found: number; sent: number; failed: number;
  expired_removed: number; created_at: string; created_by: string;
};
type Readiness = { ready: boolean; detail?: string };
type WelcomeStatus = { sent:number; queued:number; failed:number };
type EmailTemplate = {key:string;name:string;subject:string;body:string};
type EmailCampaign = {id:number;template_key:string;subject:string;body:string;audience:string;frequency:string;status:string;next_send_at:string;last_sent_at:string|null;total_sent:number;total_failed:number;total_skipped:number};
type AudienceType = "selected_agents" | "election" | "lga" | "all_agents";

const audiences: { value: AudienceType; label: string; description: string; icon: typeof Users }[] = [
  { value: "selected_agents", label: "Selected agents", description: "Choose specific recipients", icon: Users },
  { value: "election", label: "Election team", description: "Everyone assigned to an election", icon: Radio },
  { value: "lga", label: "LGA team", description: "Agents working within one LGA", icon: Megaphone },
  { value: "all_agents", label: "All agents", description: "Every active field agent", icon: BellRing },
];

async function apiError(response: Response): Promise<string> {
  try {
    const data = await response.json();
    if (typeof data.detail === "string") return data.detail;
    if (Array.isArray(data.detail)) {
      return data.detail.map((item: { msg?: string }) => item.msg).filter(Boolean).join("; ");
    }
  } catch { /* fallback below */ }
  return `Request failed (${response.status})`;
}

export default function AdminNotifications() {
  const ask = useAppPrompt();
  const { token } = useAuth();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [elections, setElections] = useState<Election[]>([]);
  const [lgas, setLgas] = useState<string[]>([]);
  const [campaigns] = useState<Campaign[]>([]);
  const [readiness] = useState<Readiness | null>(null);
  const [agentSearch, setAgentSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [emailSending,setEmailSending]=useState(false);
  const [emailForm,setEmailForm]=useState({subject:"",body:""});
  const [welcomeStatus,setWelcomeStatus]=useState<WelcomeStatus>({sent:0,queued:0,failed:0});
  const [welcomeSending,setWelcomeSending]=useState(false);
  const [emailTemplates,setEmailTemplates]=useState<EmailTemplate[]>([]),[emailCampaigns,setEmailCampaigns]=useState<EmailCampaign[]>([]);
  const [scheduleSaving,setScheduleSaving]=useState(false);
  const [scheduleForm,setScheduleForm]=useState({template_key:"",subject:"",body:"",audience:"agents",frequency:"weekly",next_send_at:""});
  const [welcomeUserIds,setWelcomeUserIds]=useState<number[]>([]),[welcomeSearch,setWelcomeSearch]=useState("");
  const [form, setForm] = useState({
    title: "", body: "", url: "/dashboard", audience_type: "selected_agents" as AudienceType,
    election_id: "", lga: "", user_ids: [] as number[],
  });

  const headers = useCallback(() => ({ Authorization: `Bearer ${token}` }), [token]);
  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError("");
    try {
      async function section(path:string){const response=await fetch(`${API_URL}${path}`,{headers:headers()});if(!response.ok)throw new Error(await apiError(response));return response.json();}
      const results=await Promise.allSettled([
        section("/api/admin/agents"),section("/api/admin/elections"),section("/api/wards/lgas"),
        section("/api/admin/email/welcome-agents/status"),section("/api/admin/email/templates"),section("/api/admin/email/campaigns"),
      ]);
      const data=results.map(result=>result.status==="fulfilled"?result.value:null);
      if(data[0])setAgents(data[0].agents||[]);if(data[1])setElections(data[1].elections||[]);
      if(data[2])setLgas(data[2].lgas||[]);if(data[3])setWelcomeStatus(data[3]);
      if(data[4])setEmailTemplates(data[4].templates||[]);if(data[5])setEmailCampaigns(data[5].campaigns||[]);
      const failures=results.filter(result=>result.status==="rejected") as PromiseRejectedResult[];
      if(failures.length)setError(`${failures.length} Notification Centre section${failures.length===1?"":"s"} could not load. The available sections remain usable. ${failures[0].reason instanceof Error?failures[0].reason.message:""}`.trim());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load Notification Centre.");
    } finally { setLoading(false); }
  }, [headers, token]);

  useEffect(() => { void load(); }, [load]);

  const filteredAgents = agents.filter(agent => `${agent.full_name} ${agent.email}`.toLowerCase().includes(agentSearch.toLowerCase()));
  const welcomeAgents=agents.filter(agent=>`${agent.full_name} ${agent.email}`.toLowerCase().includes(welcomeSearch.toLowerCase()));

  function setAudience(audience_type: AudienceType) {
    setForm(current => ({ ...current, audience_type }));
  }
  function toggleAgent(id: number) {
    setForm(current => ({ ...current, user_ids: current.user_ids.includes(id) ? current.user_ids.filter(item => item !== id) : [...current.user_ids, id] }));
  }
  function toggleVisibleAgents() {
    const visibleIds = filteredAgents.map(agent => agent.id);
    const allSelected = visibleIds.every(id => form.user_ids.includes(id));
    setForm(current => ({ ...current, user_ids: allSelected ? current.user_ids.filter(id => !visibleIds.includes(id)) : [...new Set([...current.user_ids, ...visibleIds])] }));
  }

  async function send(event: FormEvent) {
    event.preventDefault(); setSending(true); setError(""); setSuccess("");
    try {
      const response = await fetch(`${API_URL}/api/push/send`, {
        method: "POST", headers: { ...headers(), "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, election_id: form.election_id ? Number(form.election_id) : null, lga: form.lga || null }),
      });
      if (!response.ok) throw new Error(await apiError(response));
      const result = await response.json();
      const summary = `${result.message} Sent to ${result.sent} of ${result.devices_found} registered devices.`;
      if (!result.success) throw new Error(summary);
      setSuccess(summary); setForm(current => ({ ...current, title: "", body: "" }));
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to send notification.");
    } finally { setSending(false); }
  }

  async function sendEmail(event:FormEvent){
    event.preventDefault();setEmailSending(true);setError("");setSuccess("");
    try{const response=await fetch(`${API_URL}/api/admin/email/send-all`,{method:"POST",headers:{...headers(),"Content-Type":"application/json"},body:JSON.stringify(emailForm)});if(!response.ok)throw new Error(await apiError(response));const result=await response.json();const summary=`Email campaign processed: ${result.sent} sent, ${result.failed} failed, and ${result.skipped} placeholder addresses skipped.`;if(result.failed>0){setError(`${summary}${result.error?` Provider error: ${result.error}`:" Check the backend email-provider logs."}`)}else{setSuccess(summary);setEmailForm({subject:"",body:""})}}catch(caught){setError(caught instanceof Error?caught.message:"Unable to send email campaign.")}finally{setEmailSending(false)}
  }
  async function sendWelcome(event:FormEvent){event.preventDefault();setWelcomeSending(true);setError("");setSuccess("");try{const response=await fetch(`${API_URL}/api/admin/email/welcome-agents`,{method:"POST",headers:{...headers(),"Content-Type":"application/json"},body:JSON.stringify({user_ids:welcomeUserIds})});if(!response.ok)throw new Error(await apiError(response));const result=await response.json();const summary=`${result.queued} personalized welcome email${result.queued===1?" was":"s were"} queued. ${result.already_sent} already sent, ${result.already_queued} currently processing, ${result.missing_email} missing real email, ${result.missing_assignment} missing assignment, and ${result.remaining} remain for the next batch.`;if(result.queued===0&&result.already_sent>0)setError(`${summary} No email was sent because every eligible marked agent is already recorded as sent. Use “Force resend to marked” only if you intend to send it again.`);else{setSuccess(summary);setWelcomeUserIds([])}await load()}catch(caught){setError(caught instanceof Error?caught.message:"Unable to queue welcome emails.")}finally{setWelcomeSending(false)}}
  async function resendWelcome(){if((await ask({ title: "Resend welcome email?", message: `Send again to ${welcomeUserIds.length} selected agent${welcomeUserIds.length === 1 ? "" : "s"}. A recipient may receive a duplicate if the earlier message is delayed or in spam.`, confirmLabel: "Resend email" })) === null)return;setWelcomeSending(true);setError("");setSuccess("");try{const response=await fetch(`${API_URL}/api/admin/email/welcome-agents?resend_sent=true`,{method:"POST",headers:{...headers(),"Content-Type":"application/json"},body:JSON.stringify({user_ids:welcomeUserIds})});if(!response.ok)throw new Error(await apiError(response));const result=await response.json();setSuccess(`${result.queued} selected welcome email${result.queued===1?" was":"s were"} queued again.`);setWelcomeUserIds([]);await load()}catch(caught){setError(caught instanceof Error?caught.message:"Unable to resend welcome emails.")}finally{setWelcomeSending(false)}}
  function chooseEmailTemplate(key:string){const item=emailTemplates.find(value=>value.key===key);setScheduleForm(current=>({...current,template_key:key,subject:item?.subject||"",body:item?.body||""}));}
  async function scheduleEmail(event:FormEvent){event.preventDefault();setScheduleSaving(true);setError("");setSuccess("");try{const response=await fetch(`${API_URL}/api/admin/email/campaigns`,{method:"POST",headers:{...headers(),"Content-Type":"application/json"},body:JSON.stringify({...scheduleForm,next_send_at:new Date(scheduleForm.next_send_at).toISOString()})});if(!response.ok)throw new Error(await apiError(response));setSuccess("Email campaign scheduled successfully.");setScheduleForm(current=>({...current,next_send_at:""}));await load()}catch(caught){setError(caught instanceof Error?caught.message:"Unable to schedule email campaign.")}finally{setScheduleSaving(false)}}
  async function campaignAction(id:number,action:string){setError("");setSuccess("");try{const response=await fetch(`${API_URL}/api/admin/email/campaigns/${id}/${action}`,{method:"PATCH",headers:headers()});if(!response.ok)throw new Error(await apiError(response));setSuccess(action==="send-now"?"Campaign delivery started.":`Campaign ${action}d.`);await load()}catch(caught){setError(caught instanceof Error?caught.message:"Unable to update campaign.")}}

  return (
    <div className="space-y-7">
      <section className="email-centre-hero relative overflow-hidden rounded-[1.75rem] border border-slate-200 bg-gradient-to-br from-white via-white to-emerald-50 px-6 py-7 text-slate-900 shadow-sm sm:px-8">
        <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-emerald-700"><Radio size={15}/> Communications command centre</div>
            <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">Email Centre</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">Send branded email campaigns, welcome assigned agents, and manage recurring communications.</p>
          </div>
          <button onClick={() => void load()} disabled={loading} className="user-action-button user-action-refresh inline-flex w-fit items-center gap-2 rounded-xl border px-4 py-3 text-sm font-bold disabled:opacity-50"><RefreshCw size={17} className={`user-action-refresh-icon ${loading ? "animate-spin" : ""}`}/> Refresh data</button>
        </div>
        <div className="relative mt-7 grid gap-3 sm:grid-cols-3">
          <Summary label="Email series" value={emailCampaigns.length.toLocaleString("en-NG")} icon={Mail}/>
          <Summary label="Emails delivered" value={emailCampaigns.reduce((sum,item)=>sum+item.total_sent,0).toLocaleString("en-NG")} icon={Send}/>
          <Summary label="Welcome emails sent" value={welcomeStatus.sent.toLocaleString("en-NG")} icon={CheckCircle2} accent="emerald"/>
        </div>
      </section>

      {error && (
        <Notice kind="error" title="Action unsuccessful" message={error}/>
      )}
      {success && (
        <Notice kind="success" title="Campaign delivered" message={success}/>
      )}

      <form onSubmit={sendEmail} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <SectionHeading step="Email" title="Email all users" description="Send an individual email to every active user with a real email address. Placeholder addresses are skipped." icon={Mail}/>
        <div className="mt-6 grid gap-5"><Field label="Email subject" hint={`${emailForm.subject.length}/150`}><input required minLength={2} maxLength={150} className="input" value={emailForm.subject} onChange={event=>setEmailForm({...emailForm,subject:event.target.value})} placeholder="Message from Dumo Youth Network"/></Field><Field label="Email message" hint={`${emailForm.body.length}/5000`}><textarea required minLength={2} maxLength={5000} rows={7} className="input resize-y" value={emailForm.body} onChange={event=>setEmailForm({...emailForm,body:event.target.value})} placeholder="Write the message that every active user should receive."/></Field><button disabled={emailSending||loading} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 py-3 font-black text-white disabled:opacity-50">{emailSending?<Loader2 className="animate-spin" size={18}/>:<Mail size={18}/>} {emailSending?"Sending emails…":"Send email to all users"}</button></div>
      </form>
      <section className="rounded-3xl border border-emerald-200 bg-white p-5 shadow-sm sm:p-7">
        <SectionHeading step="Recurring email" title="Important email series" description="Choose a prepared message, decide who receives it, and send it once or on a recurring schedule. Optional campaigns always include an unsubscribe link." icon={Mail}/>
        <form onSubmit={scheduleEmail} className="mt-6 grid gap-5 lg:grid-cols-2">
          <Field label="Message template"><select required className="input" value={scheduleForm.template_key} onChange={event=>chooseEmailTemplate(event.target.value)}><option value="">Choose an important message</option>{emailTemplates.map(item=><option key={item.key} value={item.key}>{item.name}</option>)}</select></Field>
          <Field label="Recipients"><select className="input" value={scheduleForm.audience} onChange={event=>setScheduleForm({...scheduleForm,audience:event.target.value})}><option value="agents">All active agents</option><option value="admins">Administrators</option><option value="all">All active users</option></select></Field>
          <Field label="Subject"><input required minLength={2} maxLength={150} className="input" value={scheduleForm.subject} onChange={event=>setScheduleForm({...scheduleForm,subject:event.target.value})}/></Field>
          <Field label="Frequency"><select className="input" value={scheduleForm.frequency} onChange={event=>setScheduleForm({...scheduleForm,frequency:event.target.value})}><option value="once">Send once</option><option value="daily">Every day</option><option value="weekly">Every week</option><option value="monthly">Every 30 days</option></select></Field>
          <div className="lg:col-span-2"><Field label="Message"><textarea required minLength={2} maxLength={5000} rows={5} className="input resize-y" value={scheduleForm.body} onChange={event=>setScheduleForm({...scheduleForm,body:event.target.value})}/></Field></div>
          <Field label="First delivery date and time"><input required type="datetime-local" className="input" value={scheduleForm.next_send_at} onChange={event=>setScheduleForm({...scheduleForm,next_send_at:event.target.value})}/></Field>
          <button disabled={scheduleSaving||!scheduleForm.template_key} className="min-h-12 self-end rounded-xl bg-emerald-700 px-5 py-3 font-black text-white disabled:opacity-50">{scheduleSaving?"Scheduling…":"Schedule email series"}</button>
        </form>
        <div className="mt-7 overflow-hidden rounded-2xl border border-slate-200"><div className="border-b bg-slate-50 px-4 py-3"><h3 className="font-black">Scheduled email campaigns</h3></div><div className="divide-y">{emailCampaigns.map(item=><article key={item.id} className="grid gap-4 p-4 lg:grid-cols-[1fr_auto] lg:items-center"><div><div className="flex flex-wrap items-center gap-2"><strong>{item.subject}</strong><span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black uppercase">{item.status}</span><span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-black uppercase text-emerald-800">{item.frequency}</span></div><p className="mt-1 text-xs text-slate-500">Next: {new Date(item.next_send_at).toLocaleString("en-NG")} · Sent {item.total_sent} · Failed {item.total_failed} · Skipped/unsubscribed {item.total_skipped}</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={()=>void campaignAction(item.id,"send-now")} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white">Send now</button>{item.status==="paused"?<button type="button" onClick={()=>void campaignAction(item.id,"resume")} className="rounded-lg border px-3 py-2 text-xs font-bold">Resume</button>:item.status!=="completed"&&<button type="button" onClick={()=>void campaignAction(item.id,"pause")} className="rounded-lg border px-3 py-2 text-xs font-bold">Pause</button>}</div></article>)}{!emailCampaigns.length&&<p className="p-8 text-center text-sm text-slate-500">No recurring email campaigns have been scheduled.</p>}</div></div>
      </section>
      <form onSubmit={sendWelcome} className="rounded-3xl border border-emerald-200 bg-white p-5 shadow-sm sm:p-7">
        <SectionHeading step="Welcome" title="Welcome polling-unit agents" description="Send each assigned agent one personalized welcome email. Successfully delivered emails are never repeated." icon={Mail}/>
        <div className="mt-5 grid gap-4 sm:grid-cols-3">{[["Sent",welcomeStatus.sent],["Queued",welcomeStatus.queued],["Failed",welcomeStatus.failed]].map(([label,value])=><div key={String(label)} className="rounded-xl bg-slate-50 p-4"><p className="text-xs font-bold uppercase text-slate-500">{label}</p><p className="mt-1 text-2xl font-black">{value}</p></div>)}</div>
        <div className="mt-5 rounded-2xl border p-4"><div className="flex flex-wrap items-center justify-between gap-3"><input className="input max-w-md" value={welcomeSearch} onChange={event=>setWelcomeSearch(event.target.value)} placeholder="Search agents to mark"/><button type="button" onClick={()=>{const ids=welcomeAgents.map(agent=>agent.id);const all=ids.every(id=>welcomeUserIds.includes(id));setWelcomeUserIds(all?welcomeUserIds.filter(id=>!ids.includes(id)):[...new Set([...welcomeUserIds,...ids])])}} className="text-sm font-bold text-emerald-700">{welcomeAgents.every(agent=>welcomeUserIds.includes(agent.id))?"Unmark visible":"Mark visible"}</button></div><p className="mt-3 text-xs font-semibold text-slate-500">{welcomeUserIds.length} agent{welcomeUserIds.length===1?"":"s"} marked</p><div className="mt-3 max-h-64 divide-y overflow-auto">{welcomeAgents.map(agent=><label key={agent.id} className="flex cursor-pointer items-center gap-3 py-3 text-sm"><input type="checkbox" checked={welcomeUserIds.includes(agent.id)} onChange={()=>setWelcomeUserIds(current=>current.includes(agent.id)?current.filter(id=>id!==agent.id):[...current,agent.id])}/><span><strong>{agent.full_name}</strong><br/><span className="text-xs text-slate-500">{agent.email}</span></span></label>)}</div></div>
        <div className="mt-5 flex flex-wrap gap-3"><button disabled={welcomeSending||loading||welcomeUserIds.length===0} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 py-3 font-black text-white disabled:opacity-50">{welcomeSending?<Loader2 className="animate-spin" size={18}/>:<Send size={18}/>} {welcomeSending?"Queuing welcome emails…":`Send to ${welcomeUserIds.length} unsent marked`}</button><button type="button" disabled={welcomeSending||loading||welcomeUserIds.length===0} onClick={()=>void resendWelcome()} className="rounded-xl border border-amber-300 bg-amber-50 px-5 py-3 text-sm font-black text-amber-900 disabled:opacity-50">Force resend to marked</button></div>
      </form>

      {false && <><form onSubmit={send} className="grid gap-6 2xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,.8fr)]">
        <div className="space-y-6">
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
            <SectionHeading step="01" title="Compose the message" description="Keep field communications concise, specific, and actionable." icon={Megaphone}/>
            <div className="mt-6 grid gap-5">
              <Field label="Notification title" hint={`${form.title.length}/120`}><input required minLength={2} maxLength={120} value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} className="input" placeholder="e.g. Urgent accreditation update"/></Field>
              <Field label="Message" hint={`${form.body.length}/500`}><textarea required minLength={2} maxLength={500} rows={6} value={form.body} onChange={event => setForm({ ...form, body: event.target.value })} className="input resize-y" placeholder="State what changed, who is affected, and what action agents should take."/></Field>
              <Field label="Open this page when selected"><select value={form.url} onChange={event => setForm({ ...form, url: event.target.value })} className="input"><option value="/dashboard">Monitoring dashboard</option><option value="/agent-results">Submit results</option><option value="/incidents">Incident Centre</option><option value="/settings">Notification settings</option></select></Field>
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
            <SectionHeading step="02" title="Choose the audience" description="Target the smallest relevant operational group." icon={Users}/>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {audiences.map(item => { const Icon = item.icon; const active = form.audience_type === item.value; return <button key={item.value} type="button" onClick={() => setAudience(item.value)} className={`flex items-start gap-3 rounded-2xl border p-4 text-left transition ${active ? "border-emerald-500 bg-emerald-50 ring-2 ring-emerald-100" : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"}`}><span className={`rounded-xl p-2.5 ${active ? "bg-emerald-700 text-white" : "bg-slate-100 text-slate-600"}`}><Icon size={18}/></span><span><strong className="block text-sm text-slate-950">{item.label}</strong><span className="mt-1 block text-xs leading-5 text-slate-500">{item.description}</span></span></button>; })}
            </div>
            {form.audience_type === "election" && <div className="mt-5"><Field label="Election"><select required value={form.election_id} onChange={event => setForm({ ...form, election_id: event.target.value })} className="input"><option value="">Select an election</option>{elections.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field></div>}
            {form.audience_type === "lga" && <div className="mt-5"><Field label="Local government area"><select required value={form.lga} onChange={event => setForm({ ...form, lga: event.target.value })} className="input"><option value="">Select an LGA</option>{lgas.map(item => <option key={item}>{item}</option>)}</select></Field></div>}
            {form.audience_type === "selected_agents" && <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200"><div className="flex flex-col gap-3 border-b bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between"><div className="relative flex-1"><Search size={16} className="absolute left-3 top-3 text-slate-400"/><input value={agentSearch} onChange={event => setAgentSearch(event.target.value)} placeholder="Search agents" className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-emerald-500"/></div><button type="button" onClick={toggleVisibleAgents} className="text-xs font-black text-emerald-700">{filteredAgents.every(agent => form.user_ids.includes(agent.id)) && filteredAgents.length ? "Clear visible" : "Select visible"}</button></div><div className="max-h-72 divide-y overflow-y-auto">{filteredAgents.map(agent => <label key={agent.id} className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-slate-50"><input type="checkbox" checked={form.user_ids.includes(agent.id)} onChange={() => toggleAgent(agent.id)} className="h-4 w-4 accent-emerald-700"/><span className="flex-1"><strong className="block text-sm text-slate-900">{agent.full_name}</strong><span className="text-xs text-slate-500">{agent.email}</span></span></label>)}{!filteredAgents.length && <p className="p-8 text-center text-sm text-slate-500">No agents match this search.</p>}</div><div className="border-t bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-600">{form.user_ids.length} agent{form.user_ids.length === 1 ? "" : "s"} selected</div></div>}
          </section>
        </div>

        <aside className="space-y-6 2xl:sticky 2xl:top-6 2xl:self-start">
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <SectionHeading step="03" title="Review and send" description="Preview the notification before delivery." icon={Smartphone}/>
            <div className="mx-auto mt-6 max-w-sm rounded-[2rem] border-[7px] border-slate-900 bg-slate-100 p-3 shadow-xl">
              <div className="mb-3 flex items-center justify-between px-2 text-[10px] font-bold text-slate-500"><span>DUMO YOUTH NETWORK ELECTION MONITORING SYSTEM</span><span>now</span></div>
              <div className="rounded-2xl bg-white p-4 shadow-sm"><div className="flex items-start gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white"><BellRing size={17}/></span><div className="min-w-0"><p className="truncate text-sm font-black text-slate-950">{form.title || "Notification title"}</p><p className="mt-1 line-clamp-4 text-xs leading-5 text-slate-600">{form.body || "Your message preview will appear here as you type."}</p></div></div></div>
            </div>
            <div className="mt-5 rounded-2xl bg-slate-50 p-4 text-sm"><div className="flex justify-between gap-4"><span className="text-slate-500">Audience</span><strong className="text-right capitalize text-slate-900">{audiences.find(item => item.value === form.audience_type)?.label}</strong></div><div className="mt-3 flex justify-between gap-4"><span className="text-slate-500">Destination</span><strong className="text-right text-slate-900">{form.url}</strong></div></div>
            <div className="mt-4 flex gap-3 rounded-2xl bg-amber-50 p-4 text-xs leading-5 text-amber-900"><AlertCircle size={17} className="mt-0.5 shrink-0"/><p>Only agents who enabled notifications on at least one device can receive this message.</p></div>
            <button disabled={sending || loading || readiness?.ready === false} className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 py-3 font-black text-white shadow-lg shadow-emerald-900/15 transition hover:-translate-y-0.5 hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0">{sending ? <Loader2 size={18} className="animate-spin"/> : <Send size={18}/>} {sending ? "Sending campaign…" : "Send notification"}</button>
          </section>
        </aside>
      </form>

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-6 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-black uppercase tracking-widest text-emerald-700">Campaign log</p><h2 className="mt-1 text-xl font-black text-slate-950">Recent delivery history</h2></div><span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600">Last {campaigns.length} campaigns</span></div>
        {loading ? <div className="p-14"><Loader2 className="mx-auto animate-spin text-emerald-700"/></div> : <div className="divide-y divide-slate-100">{campaigns.map(item => { const rate = item.devices_found ? Math.round((item.sent / item.devices_found) * 100) : 0; return <article key={item.id} className="grid gap-5 p-5 transition hover:bg-slate-50/70 sm:p-6 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-center"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-black text-slate-950">{item.title}</h3><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-emerald-800">{item.audience_type.replaceAll("_", " ")}</span></div><p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-600">{item.body}</p><p className="mt-3 flex items-center gap-1.5 text-xs text-slate-400"><Clock3 size={13}/>{new Date(item.created_at).toLocaleString("en-NG")} · Sent by {item.created_by}</p></div><div><div className="grid grid-cols-4 gap-2 text-center"><HistoryMetric label="Agents" value={item.target_users}/><HistoryMetric label="Devices" value={item.devices_found}/><HistoryMetric label="Sent" value={item.sent} positive/><HistoryMetric label="Failed" value={item.failed} danger={item.failed > 0}/></div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${rate}%` }}/></div><p className="mt-1.5 text-right text-[10px] font-bold uppercase tracking-wide text-slate-400">{rate}% delivered</p></div></article>; })}{!campaigns.length && <div className="p-14 text-center"><BellRing className="mx-auto text-slate-300" size={30}/><p className="mt-3 font-bold text-slate-800">No campaigns sent yet</p><p className="mt-1 text-sm text-slate-500">Your notification history will appear here.</p></div>}</div>}
      </section></>}
    </div>
  );
}

function Summary({ label, value, icon: Icon, accent = "slate" }: { label: string; value: string; icon: typeof Users; accent?: "slate" | "emerald" | "amber" }) {
  const color = accent === "emerald" ? "text-emerald-700" : accent === "amber" ? "text-amber-700" : "text-slate-600";
  return <div className="email-centre-summary rounded-2xl border border-slate-200 bg-white/80 p-4"><div className={`flex items-center gap-2 text-xs font-semibold ${color}`}><Icon size={15}/>{label}</div><p className="email-centre-summary-value mt-2 text-2xl font-black">{value}</p></div>;
}
function Notice({ kind, title, message }: { kind: "error" | "success"; title: string; message: string }) {
  const success = kind === "success";
  const Icon = success ? CheckCircle2 : AlertCircle;
  return <div role={success ? "status" : "alert"} className={`flex gap-3 rounded-2xl border p-4 ${success ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-red-200 bg-red-50 text-red-900"}`}><Icon size={19} className="mt-0.5 shrink-0"/><div><strong className="text-sm">{title}</strong><p className="mt-1 text-sm leading-6">{message}</p></div></div>;
}
function SectionHeading({ step, title, description, icon: Icon }: { step: string; title: string; description: string; icon: typeof Users }) {
  return <div className="flex items-start gap-4"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-800"><Icon size={20}/></span><div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-700">Step {step}</p><h2 className="mt-1 text-lg font-black text-slate-950">{title}</h2><p className="mt-1 text-sm text-slate-500">{description}</p></div></div>;
}
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <label className="block"><span className="flex items-center justify-between gap-3 text-sm font-bold text-slate-700"><span>{label}</span>{hint && <span className="text-xs font-medium text-slate-400">{hint}</span>}</span><div className="mt-2">{children}</div></label>;
}
function HistoryMetric({ label, value, positive, danger }: { label: string; value: number; positive?: boolean; danger?: boolean }) {
  const color = positive ? "text-emerald-700" : danger ? "text-red-700" : "text-slate-900";
  return <div className="rounded-xl bg-slate-50 p-2.5"><strong className={`block text-base ${color}`}>{value}</strong><span className="text-[9px] font-bold uppercase tracking-wide text-slate-400">{label}</span></div>;
}
