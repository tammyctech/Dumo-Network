import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Activity, CalendarDays, CheckCircle2, ChevronDown, Clock3, MapPin, Radio, Share2, ShieldCheck } from "lucide-react";
import { PartyLogo } from "../constants/partyLogos";
import { partyColor } from "../constants/partyColors";
import { useBranding } from "../context/branding";

const ZONES: Record<string, string[]> = {
  "North Central": ["Benue", "Kogi", "Kwara", "Nasarawa", "Niger", "Plateau", "FCT"],
  "North East": ["Adamawa", "Bauchi", "Borno", "Gombe", "Taraba", "Yobe"],
  "North West": ["Jigawa", "Kaduna", "Kano", "Katsina", "Kebbi", "Sokoto", "Zamfara"],
  "South East": ["Abia", "Anambra", "Ebonyi", "Enugu", "Imo"],
  "South South": ["Akwa Ibom", "Bayelsa", "Cross River", "Delta", "Edo", "Rivers"],
  "South West": ["Ekiti", "Lagos", "Ogun", "Ondo", "Osun", "Oyo"],
};

const CANDIDATES = [
  ["Rufai Adekunle Omo-Aje", "AA"], ["Pending Court Order", "A"],
  ["Abbas-Bin Aliyu", "ADP"], ["Yusuf Kabiru", "APP"],
  ["Sowore Omoyele", "AAC"], ["Abubakar Atiku", "ADC"],
  ["Tinubu Bola Ahmed", "APC"], ["Makinde Oluseyi Abiodun", "APM"],
  ["Adenuga Sunday", "BP"], ["Adebisi Moses Olusoji", "DLA"],
  ["Okereke Sunday Chibuzo", "LP"], ["Okwori Ada Elizabeth Fredrick", "NDP"],
  ["Okereke Nkem Esther", "NRM"], ["Obi Peter Gregory", "NDC"],
  ["Onor Sandy Ojang", "PDP"], ["Duke Donald", "PRP"],
  ["Adebayo Adewole Ebenezer", "SDP"], ["Agada Peter Ada", "YPP"],
  ["Nwanyanwu Daniel Daberechukwu", "ZLP"],
] as const;
const RUNNING_MATES: Record<string, string> = {
  AA: "Shehu Hussaini", A: "Pending Court Order", ADP: "Ike Chinazam",
  APP: "Ofordile Peace Egobia", AAC: "Magashi Haruna Garba",
};
const ELECTION_DAY = new Date("2027-01-16T08:30:00+01:00");

const NIGERIA_MAP_URL = "https://media.githubusercontent.com/media/wmgeolab/geoBoundaries/main/releaseData/gbOpen/NGA/ADM1/geoBoundaries-NGA-ADM1.geojson";
type MapFeature = { properties: { shapeName: string }; geometry: { type: "Polygon" | "MultiPolygon"; coordinates: number[][][] | number[][][][] } };
type MapData = { features: MapFeature[] };

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase();
}

export default function LiveResults() {
  const branding = useBranding();
  const [selectedZone, setSelectedZone] = useState("All zones");
  const [selectedState, setSelectedState] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [mapData, setMapData] = useState<MapData | null>(null);
  const [now, setNow] = useState(()=>new Date());
  useEffect(() => { const controller = new AbortController(); void fetch(NIGERIA_MAP_URL, {signal:controller.signal}).then(response => response.ok ? response.json() : Promise.reject()).then(setMapData).catch(()=>undefined); return ()=>controller.abort(); }, []);
  useEffect(() => { const timer=window.setInterval(()=>setNow(new Date()),1000); return ()=>window.clearInterval(timer); }, []);
  const visibleStates = useMemo(
    () => selectedZone === "All zones" ? Object.values(ZONES).flat() : ZONES[selectedZone],
    [selectedZone],
  );
  const visibleCandidates = showAll ? CANDIDATES : CANDIDATES.slice(0, 6);
  const remaining=Math.max(0,ELECTION_DAY.getTime()-now.getTime());
  const countdown={days:Math.floor(remaining/86400000),hours:Math.floor(remaining/3600000)%24,mins:Math.floor(remaining/60000)%60,secs:Math.floor(remaining/1000)%60};

  return <div className="min-h-screen bg-[#f4f6f8] text-slate-950">
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur-xl">
      <div className="mx-auto flex h-18 max-w-7xl items-center justify-between px-5 lg:px-8">
        <Link to="/" className="flex items-center gap-3">
          {branding.logo_data_url ? <img src={branding.logo_data_url} alt="" className="h-10 w-10 rounded-xl object-contain"/> : <span className="grid h-10 w-10 place-items-center rounded-xl bg-sky-700 text-white"><Activity size={19}/></span>}
          <span><strong className="block text-sm tracking-[.08em]">{branding.logo_title.toUpperCase()}</strong><small className="text-xs text-slate-500">National results explorer</small></span>
        </Link>
        <div className="flex items-center gap-2 sm:gap-3"><span className="hidden items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-bold text-sky-800 md:inline-flex"><span className="h-2 w-2 rounded-full bg-sky-500"/>Online</span><time className="hidden text-xs font-bold tabular-nums text-slate-500 lg:block">{now.toLocaleTimeString("en-NG",{timeZone:"Africa/Lagos",hour:"2-digit",minute:"2-digit",second:"2-digit"})} WAT</time><button onClick={()=>void navigator.share?.({title:"2027 Presidential Election",url:window.location.href})} className="hidden rounded-xl border border-slate-200 p-2.5 text-slate-600 hover:bg-slate-50 sm:block" aria-label="Share election page"><Share2 size={17}/></button><Link to="/login" className="rounded-xl bg-sky-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-sky-800">Sign in</Link></div>
      </div>
    </header>

    <main>
      <section className="border-b border-slate-200 bg-[#071722] text-white">
        <div className="mx-auto max-w-7xl px-5 py-6 lg:px-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <label className="text-sm font-bold text-slate-300">Select election<select className="ml-0 mt-2 min-h-11 w-full rounded-xl border border-white/15 bg-white/10 px-4 text-sm font-bold text-white outline-none focus:border-sky-400 sm:ml-3 sm:mt-0 sm:w-auto"><option className="text-slate-950">Presidential/National Assembly Election</option></select></label>
            <nav className="flex gap-2 overflow-x-auto" aria-label="Election races">{[["Presidential","National"],["Senate","109 seats"],["House of Representatives","360 seats"]].map(([name,detail],index)=><button key={name} className={`shrink-0 rounded-xl px-4 py-2.5 text-left ${index===0?"bg-white text-slate-950":"border border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"}`}><strong className="block text-sm">{name}</strong><span className="text-xs opacity-60">{detail}</span></button>)}</nav>
          </div>
        </div>
      </section>

      <section className="border-b border-slate-200 bg-white py-10 sm:py-14">
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-4"><p className="text-sm font-black uppercase tracking-[.18em] text-sky-700">Election desk</p><div className="flex flex-wrap gap-2 text-xs font-bold"><span className="rounded-full bg-slate-100 px-3 py-2">Election day <strong className="ml-1">16 Jan 2027</strong></span><span className="rounded-full bg-sky-50 px-3 py-2 text-sky-800">Candidate lists <strong className="ml-1">Published</strong></span><span className="rounded-full bg-slate-100 px-3 py-2">Registered voters <strong className="ml-1">93,755,885</strong></span></div></div>
          <div className="mt-8 grid gap-8 xl:grid-cols-[1.15fr_.85fr]">
            <div><span className="text-xs font-black uppercase tracking-[.18em] text-slate-500">National</span><h1 className="mt-2 text-5xl font-black tracking-[-.055em] sm:text-7xl">Nigeria</h1><p className="mt-2 text-xl font-semibold text-slate-500">2027 Presidential election</p><div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-4"><Stat value="93.8M" label="Voters"/><Stat value="774" label="LGAs"/><Stat value="8,809" label="Wards"/><Stat value="176,846" label="Polling units"/></div><div className="mt-7 flex flex-wrap items-center gap-3"><span className="rounded-full bg-amber-50 px-4 py-2 text-sm font-black text-amber-800">Pre-election</span><span className="text-sm text-slate-500">Official preparations before voting begins</span></div></div>
            <div className="overflow-hidden rounded-3xl border border-slate-200 bg-[#f7f9fb] shadow-xl shadow-slate-950/5"><div className="border-b border-slate-200 bg-white px-6 py-4"><p className="font-black">National election centre</p></div><div className="grid grid-cols-2 gap-px bg-slate-200"><DeskMetric label="Current stage" value="Readiness" note="Logistics & deployment" icon={<ShieldCheck size={17}/>}/><DeskMetric label="Next milestone" value="Polls open" note="8:30 AM on election day" icon={<Clock3 size={17}/>}/><DeskMetric label="Data pipeline" value="Scheduled" note="Standing by" icon={<Radio size={17}/>}/><DeskMetric label="Election phase" value="Pre-election" note="Election day upcoming" icon={<CalendarDays size={17}/>}/></div></div>
          </div>
        </div>
      </section>

      <section className="border-b border-slate-200 bg-sky-50 py-12">
        <div className="mx-auto grid max-w-7xl gap-6 px-5 lg:grid-cols-[.8fr_1.2fr] lg:px-8"><div><p className="text-xs font-black uppercase tracking-[.18em] text-sky-700">Until election day</p><h2 className="mt-2 text-3xl font-black">Time remaining before polling opens</h2><span className="mt-4 inline-flex rounded-full border border-sky-200 bg-white px-3 py-1.5 text-xs font-bold text-sky-800">Pre-election</span></div><div className="grid grid-cols-4 gap-2 sm:gap-3">{Object.entries(countdown).map(([label,value])=><div key={label} className="rounded-2xl border border-sky-100 bg-white p-3 text-center shadow-sm sm:p-5"><strong className="block text-2xl font-black tabular-nums sm:text-4xl">{String(value).padStart(2,"0")}</strong><span className="mt-1 block text-xs capitalize text-slate-500">{label}</span></div>)}</div></div>
      </section>

      <section className="border-b border-slate-200 bg-white py-14">
        <div className="mx-auto max-w-7xl px-5 lg:px-8"><div className="grid gap-8 lg:grid-cols-[.7fr_1.3fr]"><div><p className="text-xs font-black uppercase tracking-[.18em] text-sky-700">Election readiness</p><h2 className="mt-2 text-3xl font-black">Official preparation milestones</h2></div><div className="space-y-3"><Readiness ready label="Official candidate lists" status="Published"/><Readiness label="Registered voters" status="Awaiting official data"/><Readiness label="PVC figures" status="Awaiting official update"/><Readiness label="Live collation" status="Activates after polls close"/></div></div></div>
      </section>

      <section className="border-b border-slate-200 bg-[#f4f6f8] py-14">
        <div className="mx-auto max-w-7xl px-5 lg:px-8"><p className="text-xs font-black uppercase tracking-[.18em] text-sky-700">Official candidates</p><div className="mt-2 flex items-end justify-between gap-4"><h2 className="text-4xl font-black">Candidates</h2><span className="text-sm font-bold text-slate-500">19 published</span></div><div className="mt-7 grid gap-3 md:grid-cols-2 xl:grid-cols-5">{CANDIDATES.slice(0,5).map(([name,party],index)=><article key={party} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><span className="text-xs font-black text-slate-400">{String(index+1).padStart(2,"0")}</span><div className="mt-4 flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-xl bg-slate-100 text-xs font-black">{initials(name)}</span><PartyLogo party={party} className="h-9 w-9"/></div><h3 className="mt-4 font-black leading-snug">{name}</h3><p className="mt-1 text-sm font-bold text-sky-700">{party}</p><p className="mt-4 border-t border-slate-100 pt-3 text-xs leading-5 text-slate-500">Running mate: <strong className="text-slate-700">{RUNNING_MATES[party]}</strong></p></article>)}</div><button onClick={()=>document.getElementById("spread-analysis")?.scrollIntoView({behavior:"smooth"})} className="mt-6 rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-black hover:border-sky-300 hover:text-sky-800">View 14 more candidates</button></div>
      </section>
      <section className="border-b border-slate-200 bg-white py-14 sm:py-20">
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          <div className="max-w-4xl"><p className="text-sm font-black uppercase tracking-[.2em] text-sky-700">Explore Nigeria</p><h1 className="mt-4 text-4xl font-black tracking-[-.05em] sm:text-6xl">Open any state result</h1><p className="mt-5 max-w-2xl text-lg leading-8 text-slate-600">Select a state to inspect it, or continue through a geopolitical zone. National results remain empty until verified reports are received.</p></div>
          <div className="mt-9 flex flex-wrap gap-2">
            <button onClick={()=>{setSelectedZone("All zones");setSelectedState("");}} className={`rounded-full px-4 py-2.5 text-sm font-bold ${selectedZone==="All zones"?"bg-slate-950 text-white":"border border-slate-200 bg-white text-slate-600 hover:border-sky-300"}`}>All zones <span className="ml-1 opacity-60">37</span></button>
            {Object.entries(ZONES).map(([zone, states])=><button key={zone} onClick={()=>{setSelectedZone(zone);setSelectedState("");}} className={`rounded-full px-4 py-2.5 text-sm font-bold ${selectedZone===zone?"bg-slate-950 text-white":"border border-slate-200 bg-white text-slate-600 hover:border-sky-300"}`}>{zone} <span className="ml-1 opacity-60">{states.length}</span></button>)}
          </div>
        </div>
      </section>

      <section className="py-12 sm:py-16">
        <div className="mx-auto grid max-w-7xl gap-6 px-5 lg:grid-cols-[1.35fr_.65fr] lg:px-8">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xl shadow-slate-950/5 sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[.16em] text-sky-700">Nigeria map</p><h2 className="mt-2 text-2xl font-black">Select a state</h2></div><span className="rounded-full bg-sky-50 px-3 py-1.5 text-xs font-bold text-sky-800">{selectedZone}</span></div>
            <div className="mt-7 rounded-2xl border border-sky-100 bg-gradient-to-br from-sky-50 to-white p-4 sm:p-7">
              {mapData&&<NigeriaMap data={mapData} selectedZone={selectedZone} selectedState={selectedState} onSelect={setSelectedState}/>} 
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-5">{visibleStates.map(state=><button key={state} onClick={()=>setSelectedState(state)} className={`min-h-14 rounded-xl border px-3 py-2 text-sm font-bold transition ${selectedState===state?"border-sky-700 bg-sky-700 text-white shadow-lg shadow-sky-900/15":"border-slate-200 bg-white text-slate-700 hover:-translate-y-0.5 hover:border-sky-300 hover:text-sky-800"}`}>{state}</button>)}</div>
            </div>
          </div>
          <aside className="rounded-3xl border border-slate-200 bg-[#071722] p-6 text-white shadow-xl shadow-slate-950/10 sm:p-8">
            <MapPin className="text-sky-400"/><p className="mt-6 text-xs font-black uppercase tracking-[.18em] text-sky-300">State result summary</p>{selectedState?<><h2 className="mt-3 text-4xl font-black text-white">{selectedState}</h2><p className="mt-3 leading-7 text-slate-300">No verified presidential reports have been received for this state.</p><div className="mt-8 grid grid-cols-2 gap-3"><Metric label="Votes reported" value="0"/><Metric label="State coverage" value="0.0%"/><Metric label="Leading party" value="—"/><Metric label="Last report" value="—"/></div></>:<div className="mt-12 rounded-2xl border border-white/10 bg-white/5 p-6 text-center"><MapPin className="mx-auto text-slate-500"/><p className="mt-4 font-bold">Select a state to see its result summary</p><p className="mt-2 text-sm leading-6 text-slate-400">Choose from the interactive state explorer.</p></div>}</aside>
        </div>
      </section>

      <section id="spread-analysis" className="scroll-mt-24 border-y border-slate-200 bg-white py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          <div className="grid gap-8 lg:grid-cols-[.75fr_1.25fr] lg:items-end"><div><p className="text-sm font-black uppercase tracking-[.18em] text-sky-700">Presidential threshold</p><h2 className="mt-3 text-4xl font-black tracking-[-.04em] sm:text-5xl">Constitutional 25% Spread Analysis</h2></div><p className="rounded-2xl border border-sky-100 bg-sky-50 p-5 leading-7 text-slate-700"><strong>Section 134(2)(b) of the 1999 Constitution:</strong> a winner must secure at least 25% of valid votes in two-thirds of all 36 states and the FCT—at least 25 jurisdictions.</p></div>
          <div className="mt-8 flex gap-3"><span className="rounded-full bg-slate-950 px-4 py-2 text-sm font-bold text-white">25 to qualify</span><span className="rounded-full border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600">19 candidates</span></div>
          <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{visibleCandidates.map(([name, party])=><article key={`${party}-${name}`} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-xl"><div className="h-1" style={{backgroundColor:partyColor(party)}}/><div className="p-5"><div className="flex items-center gap-3"><span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-slate-100 text-sm font-black text-slate-700">{initials(name)}</span><div className="min-w-0"><h3 className="truncate font-black">{name}</h3><div className="mt-1 flex items-center gap-2"><PartyLogo party={party} className="h-7 w-7"/><span className="text-sm font-bold text-slate-500">{party}</span></div></div></div><div className="mt-5 flex items-end justify-between border-t border-slate-100 pt-4"><div><strong className="text-2xl font-black">0</strong><span className="ml-1 text-sm text-slate-500">votes (0.0%)</span></div><span className="text-sm font-black text-slate-900">0 / 25</span></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full w-0 bg-sky-600"/></div><p className="mt-3 flex items-center gap-2 text-sm text-slate-500"><ShieldCheck size={15}/>Awaiting state spread</p></div></article>)}</div>
          <div className="mt-8 text-center"><button onClick={()=>setShowAll(value=>!value)} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-black text-slate-800 hover:border-sky-300 hover:text-sky-800">{showAll?"Show top 6":"Show all 19 candidates"}<ChevronDown size={17} className={showAll?"rotate-180":""}/></button></div>
        </div>
      </section>

      <section className="bg-[#071722] py-10 text-white"><div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 sm:flex-row sm:items-center sm:justify-between lg:px-8"><div className="flex items-center gap-3"><CheckCircle2 className="text-sky-400"/><p><strong>Transparent by design.</strong><span className="ml-2 text-slate-400">Figures remain unofficial until declared by the authorized electoral body.</span></p></div><Link to="/" className="text-sm font-bold text-sky-300 hover:text-white">Return to public dashboard</Link></div></section>
    </main>
  </div>;
}

function Metric({label,value}:{label:string;value:string}) {
  return <div className="rounded-xl border border-white/10 bg-white/5 p-4"><span className="block text-xs text-slate-400">{label}</span><strong className="mt-2 block text-xl text-white">{value}</strong></div>;
}

function Stat({value,label}:{value:string;label:string}) {
  return <div className="rounded-2xl border border-slate-200 bg-[#f7f9fb] p-4"><strong className="block text-2xl font-black tracking-tight">{value}</strong><span className="mt-1 block text-xs font-bold uppercase tracking-[.08em] text-slate-500">{label}</span></div>;
}

function DeskMetric({label,value,note,icon}:{label:string;value:string;note:string;icon:ReactNode}) {
  return <div className="bg-white p-5"><span className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.08em] text-slate-500">{icon}{label}</span><strong className="mt-3 block text-xl">{value}</strong><small className="mt-1 block text-slate-500">{note}</small></div>;
}

function Readiness({label,status,ready=false}:{label:string;status:string;ready?:boolean}) {
  return <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-[#f7f9fb] p-4"><span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${ready?"bg-sky-100 text-sky-700":"border border-slate-300 bg-white text-slate-400"}`}>{ready?<CheckCircle2 size={18}/>:<span className="h-2.5 w-2.5 rounded-full border-2 border-current"/>}</span><div className="min-w-0 flex-1"><strong className="block">{label}</strong><span className="mt-0.5 block text-sm text-slate-500">{status}</span></div></div>;
}

function NigeriaMap({data,selectedZone,selectedState,onSelect}:{data:MapData;selectedZone:string;selectedState:string;onSelect:(state:string)=>void}) {
  const projection = useMemo(()=>{
    const points=data.features.flatMap(feature=>feature.geometry.type==="Polygon"?(feature.geometry.coordinates as number[][][]).flat(1):(feature.geometry.coordinates as number[][][][]).flat(2));
    const xs=points.map(point=>point[0]),ys=points.map(point=>point[1]);const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);const width=620,height=460,padding=18,scale=Math.min((width-padding*2)/(maxX-minX),(height-padding*2)/(maxY-minY));return {width,height,project:([x,y]:number[])=>[padding+(x-minX)*scale,height-(padding+(y-minY)*scale)]};
  },[data]);
  function stateName(raw:string){return raw==="Abuja Federal Capital Territory"?"FCT":raw;}
  function path(feature:MapFeature){const polygons=feature.geometry.type==="Polygon"?[feature.geometry.coordinates as number[][][]]:feature.geometry.coordinates as number[][][][];return polygons.flatMap(polygon=>polygon.map(ring=>ring.map((point,index)=>{const [x,y]=projection.project(point);return `${index?"L":"M"}${x.toFixed(1)},${y.toFixed(1)}`;}).join(" ")+" Z")).join(" ");}
  return <svg viewBox={`0 0 ${projection.width} ${projection.height}`} role="img" aria-label="Nigeria map. Select a state to open its Presidential result" className="mb-7 h-[300px] w-full sm:h-[390px]">{data.features.map(feature=>{const state=stateName(feature.properties.shapeName);const inZone=selectedZone==="All zones"||ZONES[selectedZone]?.includes(state);const active=selectedState===state;return <path key={state} d={path(feature)} onClick={()=>onSelect(state)} tabIndex={0} onKeyDown={event=>{if(event.key==="Enter"||event.key===" ")onSelect(state);}} aria-label={`Open ${state} result`} fill={active?"#0284c7":inZone?"#dbeafe":"#f1f5f9"} stroke={active?"#075985":"#94a3b8"} strokeWidth={active?2.5:1} className="cursor-pointer outline-none transition hover:fill-sky-200 focus:stroke-sky-700"/>;})}</svg>;
}
