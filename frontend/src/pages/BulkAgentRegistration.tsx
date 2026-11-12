import { useCallback, useEffect, useState, type DragEvent } from "react";
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, History, LoaderCircle, Upload } from "lucide-react";
import { useAuth } from "../context/AuthContext";

// Production uploads use Vercel's same-origin /api proxy. This avoids
// cross-origin upload failures on browsers and networks that block Render.
const API = import.meta.env.DEV
  ? (import.meta.env.VITE_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "")
  : "";
type Row = { row_number:number; full_name:string; phone_number:string|null; lga:string; ward:string; polling_unit_number:string; polling_unit_code:string; existing_account:boolean; valid:boolean; errors:string[] };
type Preview = { total_records:number; valid_records:number; invalid_records:number; can_import:boolean; rows:Row[] };
type ImportRecord = { id:number; import_date:string; administrator:string; filename:string; election:string; total_records:number; registered_agents:number; assigned_agents:number; skipped_records:number; failed_records:number };

async function detail(response: Response) {
  try {
    const data = await response.json();
    if (typeof data.detail === "string") return data.detail;
    if (Array.isArray(data.detail)) {
      const messages = data.detail
        .map((item: unknown) => {
          if (typeof item === "string") return item;
          if (item && typeof item === "object" && "msg" in item && typeof item.msg === "string") {
            return item.msg;
          }
          return "";
        })
        .filter(Boolean);
      if (messages.length) return messages.join(" ");
    }
    if (typeof data.message === "string") return data.message;
  } catch {
    // Some upstream and proxy errors return HTML or an empty response body.
  }
  return `Request failed (${response.status} ${response.statusText || "Unknown error"}).`;
}
function requestMessage(error: unknown) {
  if (error instanceof TypeError) {
    const endpoint = API || window.location.origin;
    return `Could not reach the Dumo API through ${endpoint}. Check that the backend deployment is online.`;
  }
  return error instanceof Error ? error.message : "Request failed.";
}

export default function BulkAgentRegistration() {
  const { token } = useAuth();
  const headers = useCallback(() => ({ Authorization:`Bearer ${token}` }), [token]);
  const [history,setHistory]=useState<ImportRecord[]>([]);
  const [file,setFile]=useState<File|null>(null), [preview,setPreview]=useState<Preview|null>(null);
  const [busy,setBusy]=useState(false), [error,setError]=useState(""), [credentials,setCredentials]=useState<Record<string,string>[]>([]);
  const load=useCallback(async()=>{if(!token)return; try { const response=await fetch(`${API}/api/admin/agent-imports`,{headers:headers()}); if(!response.ok)throw new Error(await detail(response));setHistory(await response.json()); } catch(value) { setError(requestMessage(value)); }},[token,headers]);
  useEffect(()=>{void load()},[load]);
  function choose(value:File|null){setFile(value);setPreview(null);setCredentials([]);setError("")}
  function drop(event:DragEvent){event.preventDefault();choose(event.dataTransfer.files[0]||null)}
  async function send(path:string){if(!file){setError("Select a file first.");return} if(file.size>10*1024*1024){setError("The file exceeds the 10 MB upload limit.");return} setBusy(true);setError(""); const form=new FormData();form.append("file",file); try{const r=await fetch(`${API}/api/admin/agent-imports/${path}`,{method:"POST",headers:headers(),body:form});if(!r.ok)throw new Error(await detail(r));const data=await r.json();if(path==="preview")setPreview(data);else{setCredentials(data.credentials||[]);setPreview(null);await load()}}catch(e){setError(requestMessage(e))}finally{setBusy(false)}}
  function downloadCredentials(){const rows=[["Full Name","Phone Number","Temporary Password"],...credentials.map(c=>[c.full_name,c.phone_number,c.temporary_password])];const csv=rows.map(r=>r.map(v=>`"${String(v).replaceAll('"','""')}"`).join(",")).join("\n");const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));a.download="dumo-agent-credentials.csv";a.click();URL.revokeObjectURL(a.href)}
  return <div className="space-y-7 pb-10">
    <div><p className="text-xs font-bold uppercase tracking-widest text-emerald-700">Administration</p><h1 className="mt-2 text-3xl font-black text-slate-950">Bulk Agent Registration</h1><p className="mt-2 text-sm text-slate-600">Register permanent polling-unit agents for all current and future elections.</p></div>
    {error&&<p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>}
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
      <div onDragOver={e=>e.preventDefault()} onDrop={drop} className="rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-5 text-center"><FileSpreadsheet className="mx-auto text-emerald-700"/><p className="mt-2 text-sm font-semibold">{file?.name||"Drop CSV/XLSX here"}</p><label className="mt-3 inline-flex cursor-pointer rounded-lg bg-white px-4 py-2 text-xs font-bold shadow-sm">Choose file<input type="file" accept=".csv,.xlsx" className="sr-only" onChange={e=>choose(e.target.files?.[0]||null)}/></label></div>
      <div className="mt-5 flex flex-wrap gap-3"><button onClick={()=>void send("preview")} disabled={busy} className="flex items-center gap-2 rounded-xl bg-emerald-700 px-5 py-3 text-sm font-bold text-white disabled:opacity-50">{busy?<LoaderCircle className="animate-spin" size={18}/>:<Upload size={18}/>}Validate file</button><a href={`${API}/api/admin/agent-imports/template`} onClick={async e=>{e.preventDefault();const r=await fetch(e.currentTarget.href,{headers:headers()});const b=await r.blob();const a=document.createElement("a");a.href=URL.createObjectURL(b);a.download="dumo-agent-import-template.csv";a.click()}} className="flex items-center gap-2 rounded-xl border px-5 py-3 text-sm font-bold"><Download size={18}/>Download template</a></div>
    </section>
    {preview&&<section className="rounded-2xl border border-slate-200 bg-white p-5"><div className="flex flex-wrap items-center justify-between gap-4"><div><h2 className="font-black">Validation results</h2><p className="text-sm text-slate-600">{preview.valid_records} ready · {preview.invalid_records} failed · {preview.total_records} total</p></div><button disabled={!preview.can_import||busy} onClick={()=>void send("confirm")} className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-bold text-white disabled:opacity-40">Confirm valid records</button></div><div className="mt-5 max-h-96 overflow-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-slate-50"><tr>{["Row","Agent","Phone","Location","Polling Unit","Status"].map(x=><th className="p-3" key={x}>{x}</th>)}</tr></thead><tbody>{preview.rows.map(r=><tr key={r.row_number} className="border-t"><td className="p-3">{r.row_number}</td><td>{r.full_name}</td><td>{r.phone_number||"—"}</td><td>{r.ward}, {r.lga}</td><td>{r.polling_unit_code||r.polling_unit_number}</td><td className="p-3">{r.valid?<span className="text-emerald-700"><CheckCircle2 className="inline" size={16}/> Ready{r.existing_account?" (existing)":""}</span>:<span className="text-red-700" title={r.errors.join(" ")}><AlertTriangle className="inline" size={16}/> {r.errors.join(" ")}</span>}</td></tr>)}</tbody></table></div></section>}
    {credentials.length>0&&<section className="rounded-2xl border border-amber-200 bg-amber-50 p-5"><h2 className="font-black text-amber-950">Agent login credentials</h2><p className="mt-1 text-sm text-amber-800">All newly created agents use the temporary password <strong>12345</strong> and must change it immediately after their first login.</p><button onClick={downloadCredentials} className="mt-4 flex items-center gap-2 rounded-xl bg-amber-900 px-5 py-3 text-sm font-bold text-white"><Download size={18}/>Download credentials</button></section>}
    <section className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="flex items-center gap-2 font-black"><History size={19}/>Import history</h2><div className="mt-4 overflow-auto"><table className="w-full min-w-[800px] text-left text-sm"><thead><tr>{["Date","File","Election","Administrator","Total","Registered","Assigned","Failed"].map(x=><th className="border-b p-3" key={x}>{x}</th>)}</tr></thead><tbody>{history.map(h=><tr key={h.id}><td className="p-3">{new Date(h.import_date).toLocaleString()}</td><td>{h.filename}</td><td>{h.election}</td><td>{h.administrator}</td><td>{h.total_records}</td><td>{h.registered_agents}</td><td>{h.assigned_agents}</td><td>{h.failed_records}{h.failed_records>0&&<a className="ml-2 text-emerald-700 underline" href={`${API}/api/admin/agent-imports/${h.id}/errors`} onClick={async e=>{e.preventDefault();const r=await fetch(e.currentTarget.href,{headers:headers()});const b=await r.blob();const a=document.createElement("a");a.href=URL.createObjectURL(b);a.download=`agent-import-${h.id}-errors.csv`;a.click()}}>report</a>}</td></tr>)}</tbody></table></div></section>
  </div>;
}
