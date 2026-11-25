import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Activity, CalendarDays, CheckCircle2, MapPin, Radio, Share2, ShieldCheck } from "lucide-react";
import { PartyLogo } from "../constants/partyLogos";
import { useBranding } from "../context/branding";

const RIVERS_LGAS = ["Abua/Odual", "Ahoada East", "Ahoada West", "Akuku-Toru", "Andoni", "Asari-Toru", "Bonny", "Degema", "Eleme", "Emohua", "Etche", "Gokana", "Ikwerre", "Khana", "Obio/Akpor", "Ogba/Egbema/Ndoni", "Ogu/Bolo", "Okrika", "Omuma", "Opobo/Nkoro", "Oyigbo", "Port Harcourt", "Tai"];

const GOVERNORSHIP_candidates = [
  ["Chibuzor Israel Rain", "A"], ["West Ivy", "AAC"],
  ["Pidomson Gabriel Baritulem", "ADC"], ["Lawson Anyanate Angel", "ADP"],
  ["Chinda Kingsley Ogundu", "APC"], ["Idoniboye-Obu Omangima", "APGA"],
  ["Whyte Churchill Dagogo", "APM"], ["Atata Okechukwu Kenneth", "APP"],
  ["Benjamin Abednego Oli", "BP"], ["Warigbani Ezekiel Zebulun", "DLA"],
  ["Boms Chima Ernest", "LP"], ["Dumo Lulu-Briggs Owukori", "NDC"],
  ["Opusunju Silva", "NDP"], ["Pepple Wari Dienye", "NNPP"],
  ["Minaibim Harry", "NRM"], ["Ejekwu Samuel Soni", "PDP"],
  ["Kieghe Nature Dumale", "PRP"], ["Ben-Gurion J. Peter", "SDP"],
  ["Hart Victor Godwin", "ZLP"],
] as const;
const PRESIDENTIAL_candidates = [
  ["Pending Court Order", "A"], ["Rufai Adekunle F. Omo-Aje", "AA"],
  ["Sowore Omoyele", "AAC"], ["Abubakar Atiku", "ADC"],
  ["Abbas-Bin Aliyu", "ADP"], ["Tinubu Bola Ahmed", "APC"],
  ["Makinde Oluseyi Abiodun", "APM"], ["Yusuf Kabiru", "APP"],
  ["Adenuga Sunday", "BP"], ["Adebisi Moses Olusoji", "DLA"],
  ["Okereke Sunday Chibuzo", "LP"], ["Obi Peter Gregory", "NDC"],
  ["Okwori Ada Elizabeth Fredrick", "NDP"], ["Okereke Nkem Esther", "NRM"],
  ["Onor Sandy Ojang", "PDP"], ["Duke Donald", "PRP"],
  ["Adebayo Adewole Ebenezer", "SDP"], ["Agada Peter Ada", "YPP"],
  ["Nwanyanwu Daniel Daberechukwu", "ZLP"],
] as const;
const PRESIDENTIAL_ELECTION_DAY = new Date("2027-01-16T08:30:00+01:00");
const GOVERNORSHIP_ELECTION_DAY = new Date("2027-02-06T08:30:00+01:00");
const RIVERS_REGISTERED_VOTERS = 3_537_190;

const RIVERS_MAP_URL = "/data/rivers-lgas.geojson";
type MapFeature = { properties: { shapeName: string }; geometry: { type: "Polygon" | "MultiPolygon"; coordinates: number[][][] | number[][][][] } };
type MapData = { features: MapFeature[] };
type PartyTotal={party:string;votes:number};
type LgaResult={lga:string;total_wards:number;total_polling_units:number;submitted_polling_units:number;coverage_percent:number|null;leader:PartyTotal|null;leader_percentage:number;party_totals:PartyTotal[]};
type Overview={election:{id:number;name:string;election_date:string}|null;total_polling_units:number;submitted_polling_units:number;submission_coverage_percent:number|null;party_totals:PartyTotal[];lga_results:LgaResult[];last_updated:string|null};
const API=import.meta.env.DEV?(import.meta.env.VITE_API_URL||"http://127.0.0.1:8000").replace(/\/$/,""):"";
const normalize=(value:string)=>{
  const normalized=value.toLowerCase().replace(/[^a-z]/g,"");
  const aliases:Record<string,string>={emuoha:"emohua",omumma:"omuma"};
  return aliases[normalized]||normalized;
};

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase();
}

export default function LiveResults() {
  const branding = useBranding();
  const [race,setRace]=useState<"governorship"|"presidential">("governorship");
  const [selectedZone] = useState("Rivers State");
  const [selectedState, setSelectedState] = useState("Port Harcourt");
  const [overview,setOverview]=useState<Overview>({election:null,total_polling_units:0,submitted_polling_units:0,submission_coverage_percent:0,party_totals:[],lga_results:[],last_updated:null});
  const [mapData, setMapData] = useState<MapData | null>(null);
  const [mapError, setMapError] = useState("");
  const [now, setNow] = useState(()=>new Date());
  useEffect(() => { const controller = new AbortController(); void fetch(RIVERS_MAP_URL, {signal:controller.signal}).then(response => response.ok ? response.json() : Promise.reject(new Error("Map boundaries could not be loaded."))).then(setMapData).catch(error=>{if(!controller.signal.aborted)setMapError(error instanceof Error?error.message:"Map boundaries could not be loaded.");}); return ()=>controller.abort(); }, []);
  useEffect(()=>{const controller=new AbortController();const load=()=>void fetch(`${API}/api/public/election-overview`,{signal:controller.signal}).then(response=>response.ok?response.json():Promise.reject()).then((data:Overview)=>{setOverview(data);setRace(data.election?.name.toLowerCase().includes("president")?"presidential":"governorship")}).catch(()=>undefined);load();const timer=window.setInterval(load,60000);return()=>{controller.abort();window.clearInterval(timer)}},[]);
  useEffect(() => { const timer=window.setInterval(()=>setNow(new Date()),1000); return ()=>window.clearInterval(timer); }, []);
  const visibleStates = useMemo(
    () => RIVERS_LGAS,
    [],
  );
  const lgaByName=useMemo(()=>new Map(overview.lga_results.map(row=>[normalize(row.lga),row])),[overview.lga_results]);
  const activeLga=lgaByName.get(normalize(selectedState));
  const totalVotes=overview.party_totals.reduce((sum,row)=>sum+row.votes,0);
  const candidatePriority:Record<string,number>={NDC:0,ADC:1,APC:2};
  const candidates=[...(race==="governorship"?GOVERNORSHIP_candidates:PRESIDENTIAL_candidates)]
    .sort((left,right)=>(candidatePriority[left[1]]??99)-(candidatePriority[right[1]]??99));
  const electionDay=overview.election?.election_date?new Date(overview.election.election_date):(race==="governorship"?GOVERNORSHIP_ELECTION_DAY:PRESIDENTIAL_ELECTION_DAY);
  const remaining=Math.max(0,electionDay.getTime()-now.getTime());
  const countdown={days:Math.floor(remaining/86400000),hours:Math.floor(remaining/3600000)%24,mins:Math.floor(remaining/60000)%60,secs:Math.floor(remaining/1000)%60};

  return <div className="min-h-screen bg-[#f4f6f8] text-slate-950">
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur-xl">
      <div className="mx-auto flex h-18 max-w-7xl items-center justify-between px-5 lg:px-8">
        <Link to="/" className="flex items-center gap-3">
          {branding.logo_data_url ? <img src={branding.logo_data_url} alt="" className="h-10 w-10 rounded-xl object-contain"/> : <span className="grid h-10 w-10 place-items-center rounded-xl bg-sky-700 text-white"><Activity size={19}/></span>}
          <span><strong className="block text-sm tracking-[.08em]">{branding.logo_title.toUpperCase()}</strong><small className="text-xs text-slate-500">Rivers results explorer</small></span>
        </Link>
        <div className="flex items-center gap-2 sm:gap-3"><span className="hidden items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-bold text-sky-800 md:inline-flex"><span className="h-2 w-2 rounded-full bg-sky-500"/>Online</span><time className="hidden text-xs font-bold tabular-nums text-slate-500 lg:block">{now.toLocaleTimeString("en-NG",{timeZone:"Africa/Lagos",hour:"2-digit",minute:"2-digit",second:"2-digit"})} WAT</time><button onClick={()=>void navigator.share?.({title:"2027 Presidential Election",url:window.location.href})} className="hidden rounded-xl border border-slate-200 p-2.5 text-slate-600 hover:bg-slate-50 sm:block" aria-label="Share election page"><Share2 size={17}/></button><Link to="/login" className="rounded-xl bg-sky-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-sky-800">Sign in</Link></div>
      </div>
    </header>

    <main>
      <section className="border-b border-slate-200 bg-[#071722] text-white">
        <div className="mx-auto max-w-7xl px-5 py-6 lg:px-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="text-sm font-bold text-slate-300">Active election<span className="ml-0 mt-2 block min-h-11 rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-bold text-white sm:ml-3 sm:mt-0 sm:inline-flex">{overview.election?.name || "No active election"}</span></div>
            <span className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-left text-slate-200"><strong className="block text-sm capitalize">{race}</strong><span className="text-xs opacity-60">Selected by administrator</span></span>
          </div>
        </div>
      </section>

      <section className="border-b border-slate-200 bg-white py-10 sm:py-14">
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-4"><p className="text-sm font-black uppercase tracking-[.18em] text-sky-700">Election desk</p><div className="flex flex-wrap gap-2 text-xs font-bold"><span className="rounded-full bg-slate-100 px-3 py-2">Election day <strong className="ml-1">{electionDay.toLocaleDateString("en-NG",{day:"numeric",month:"short",year:"numeric",timeZone:"Africa/Lagos"})}</strong></span><span className="rounded-full bg-sky-50 px-3 py-2 text-sky-800">Candidate lists <strong className="ml-1">Published</strong></span><span className="rounded-full bg-slate-100 px-3 py-2">Registered voters <strong className="ml-1">{RIVERS_REGISTERED_VOTERS.toLocaleString()}</strong></span></div></div>
          <div className="mt-8 grid gap-8 xl:grid-cols-[1.15fr_.85fr]">
            <div><span className="text-xs font-black uppercase tracking-[.18em] text-slate-500">South South</span><h1 className="mt-2 text-5xl font-black tracking-[-.055em] sm:text-7xl">Rivers State</h1><p className="mt-2 text-xl font-semibold text-slate-500">{race==="governorship"?"Governorship election":"Presidential election · Rivers State result"}</p><div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-4"><Stat value="23" label="LGAs"/><Stat value={String(overview.lga_results.reduce((sum,row)=>sum+row.total_wards,0))} label="Wards"/><Stat value={overview.total_polling_units.toLocaleString()} label="Polling units"/><Stat value={`${overview.submission_coverage_percent??0}%`} label="Reporting"/></div><div className="mt-7 flex flex-wrap items-center gap-3"><span className="rounded-full bg-sky-50 px-4 py-2 text-sm font-black text-sky-800">Live collation</span><span className="text-sm text-slate-500">Unofficial agent-submitted results</span></div></div>
            <div className="overflow-hidden rounded-3xl border border-slate-200 bg-[#f7f9fb] shadow-xl shadow-slate-950/5"><div className="border-b border-slate-200 bg-white px-6 py-4"><p className="font-black">Rivers election centre</p></div><div className="grid grid-cols-2 gap-px bg-slate-200"><DeskMetric label="Current stage" value="Collation" note="Live field reports" icon={<ShieldCheck size={17}/>}/><DeskMetric label="LGAs covered" value={`${overview.lga_results.filter(row=>row.submitted_polling_units>0).length} / 23`} note="Local governments" icon={<MapPin size={17}/>}/><DeskMetric label="Units reporting" value={overview.submitted_polling_units.toLocaleString()} note="Polling units" icon={<Radio size={17}/>}/><DeskMetric label="Last update" value={overview.last_updated?new Date(overview.last_updated).toLocaleTimeString("en-NG",{timeZone:"Africa/Lagos",hour:"2-digit",minute:"2-digit"}):"—"} note="West Africa Time" icon={<CalendarDays size={17}/>}/></div></div>
          </div>
        </div>
      </section>

      <section className="live-results-countdown border-b border-slate-200 bg-sky-50 py-12">
        <div className="mx-auto grid max-w-7xl gap-6 px-5 lg:grid-cols-[.8fr_1.2fr] lg:px-8"><div><p className="live-results-countdown-label text-xs font-black uppercase tracking-[.18em]">Until election day</p><h2 className="live-results-countdown-heading mt-2 text-3xl font-black">Time remaining before polling opens</h2><span className="live-results-countdown-badge mt-4 inline-flex rounded-full border px-3 py-1.5 text-xs font-bold">Pre-election</span></div><div className="grid grid-cols-4 gap-2 sm:gap-3">{Object.entries(countdown).map(([label,value])=><div key={label} className="live-results-countdown-card rounded-2xl border p-3 text-center shadow-sm sm:p-5"><strong className="live-results-countdown-value block text-2xl font-black tabular-nums sm:text-4xl">{String(value).padStart(2,"0")}</strong><span className="live-results-countdown-unit mt-1 block text-xs capitalize">{label}</span></div>)}</div></div>
      </section>

      <section className="border-b border-slate-200 bg-white py-14">
        <div className="mx-auto max-w-7xl px-5 lg:px-8"><div className="grid gap-8 lg:grid-cols-[.7fr_1.3fr]"><div><p className="text-xs font-black uppercase tracking-[.18em] text-sky-700">Election readiness</p><h2 className="mt-2 text-3xl font-black">Official preparation milestones</h2></div><div className="space-y-3"><Readiness ready label="Official candidate lists" status="Published"/><Readiness ready label="Registered voters" status="3,537,190 · INEC official figure"/><Readiness label="PVC figures" status="Awaiting official update"/><Readiness label="Live collation" status="Activates after polls close"/></div></div></div>
      </section>

      <section className="border-b border-slate-200 bg-[#f4f6f8] py-14">
        <div className="mx-auto max-w-7xl px-5 lg:px-8"><p className="text-xs font-black uppercase tracking-[.18em] text-sky-700">{race==="governorship"?"Governorship candidates":"Presidential candidates"}</p><div className="mt-2 flex items-end justify-between gap-4"><h2 className="text-4xl font-black">Candidates</h2><span className="text-sm font-bold text-slate-500">{candidates.length} published</span></div><CandidateCarousel candidates={candidates} totals={overview.party_totals} label="Published candidates" /><button onClick={()=>document.getElementById("spread-analysis")?.scrollIntoView({behavior:"smooth"})} className="mt-6 rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-black hover:border-sky-300 hover:text-sky-800">View live candidate scores</button></div>
      </section>
      <section className="border-b border-slate-200 bg-white py-14 sm:py-20">
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          <div className="max-w-4xl"><p className="text-sm font-black uppercase tracking-[.2em] text-sky-700">Explore Rivers State</p><h1 className="mt-4 text-4xl font-black tracking-[-.05em] sm:text-6xl">Open any LGA result</h1><p className="mt-5 max-w-2xl text-lg leading-8 text-slate-600">Select one of the 23 local government areas to see its wards, polling units, live score and leading candidate percentage.</p></div>
        </div>
      </section>

      <section className="py-12 sm:py-16">
        <div className="mx-auto grid max-w-7xl gap-6 px-5 lg:grid-cols-[1.35fr_.65fr] lg:px-8">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xl shadow-slate-950/5 sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[.16em] text-sky-700">Rivers State map</p><h2 className="mt-2 text-2xl font-black">Select an LGA</h2></div><span className="rounded-full bg-sky-50 px-3 py-1.5 text-xs font-bold text-sky-800">23 LGAs</span></div>
            <div className="mt-7 rounded-2xl border border-sky-100 bg-gradient-to-br from-sky-50 to-white p-4 sm:p-7">
              {mapData?<NigeriaMap data={mapData} selectedZone={selectedZone} selectedState={selectedState} onSelect={setSelectedState}/>:<div className="mb-7 flex h-[300px] items-center justify-center rounded-xl border border-dashed border-sky-200 bg-white px-6 text-center text-sm font-semibold text-slate-500 sm:h-[390px]">{mapError||"Loading Rivers State map…"}</div>}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-5">{visibleStates.map(state=>{const row=lgaByName.get(normalize(state));return <button key={state} onClick={()=>setSelectedState(state)} className={`min-h-14 rounded-xl border px-3 py-2 text-left text-sm font-bold transition ${selectedState===state?"border-sky-700 bg-sky-700 text-white shadow-lg shadow-sky-900/15":"border-slate-200 bg-white text-slate-700 hover:-translate-y-0.5 hover:border-sky-300 hover:text-sky-800"}`}>{state}<small className="mt-1 block font-medium opacity-70">{row?.total_wards??0} wards · {row?.total_polling_units??0} units</small></button>})}</div>
            </div>
          </div>
          <aside className="rounded-3xl border border-slate-200 bg-[#071722] p-6 text-white shadow-xl shadow-slate-950/10 sm:p-8">
            <MapPin className="text-sky-400"/><p className="mt-6 text-xs font-black uppercase tracking-[.18em] text-sky-300">LGA result summary</p><h2 className="mt-3 text-4xl font-black !text-white">{selectedState}</h2><p className="mt-3 leading-7 text-slate-300">Live ${race==="governorship"?"governorship":"presidential"} result from submitted polling units.</p><div className="mt-8 grid grid-cols-2 gap-3"><Metric label="Wards" value={String(activeLga?.total_wards??0)}/><Metric label="Polling units" value={String(activeLga?.total_polling_units??0)}/><Metric label="Units reporting" value={String(activeLga?.submitted_polling_units??0)}/><Metric label="Coverage" value={`${activeLga?.coverage_percent??0}%`}/><Metric label="Leading party" value={activeLga?.leader?.party??"—"}/><Metric label="Winning share" value={`${activeLga?.leader_percentage??0}%`}/></div></aside>
        </div>
      </section>

      <section id="spread-analysis" className="scroll-mt-24 border-y border-slate-200 bg-white py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          <div className="grid gap-8 lg:grid-cols-[.75fr_1.25fr] lg:items-end"><div><p className="text-sm font-black uppercase tracking-[.18em] text-sky-700">Live {race==="governorship"?"governorship":"presidential"} score</p><h2 className="mt-3 text-4xl font-black tracking-[-.04em] sm:text-5xl">Statewide candidate results</h2></div><p className="rounded-2xl border border-sky-100 bg-sky-50 p-5 leading-7 text-slate-700">Vote totals and percentages update automatically from submitted polling-unit reports across Rivers State.</p></div>
          <div className="mt-8 flex gap-3"><span className="rounded-full bg-slate-950 px-4 py-2 text-sm font-bold text-white">{overview.submitted_polling_units} units reporting</span><span className="rounded-full border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600">{candidates.length} candidates</span></div>
          <CandidateCarousel candidates={candidates} totals={overview.party_totals} totalVotes={totalVotes} label="Statewide candidate scores" />
        </div>
      </section>

      <section className="bg-[#071722] py-10 text-white"><div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 sm:flex-row sm:items-center sm:justify-between lg:px-8"><div className="flex items-center gap-3"><CheckCircle2 className="text-sky-400"/><p><strong>Transparent by design.</strong><span className="ml-2 text-slate-400">Figures remain unofficial until declared by the authorized electoral body.</span></p></div><Link to="/" className="text-sm font-bold text-sky-300 hover:text-white">Return to public dashboard</Link></div></section>
    </main>
  </div>;
}
function CandidateCarousel({ candidates, totals, totalVotes, label }: {
  candidates: readonly (readonly [string, string])[];
  totals: PartyTotal[];
  totalVotes?: number;
  label: string;
}) {
  const track = useRef<HTMLDivElement>(null);

  function move(direction: number) {
    const element = track.current;
    if (!element) return;
    const firstCard = element.firstElementChild;
    if (!firstCard) return;
    const gap = parseFloat(getComputedStyle(element).columnGap) || 0;
    const step = firstCard.getBoundingClientRect().width + gap;
    const cardsPerPage = Math.max(1, Math.floor((element.clientWidth + gap) / step + 0.01));
    element.scrollBy({
      left: direction * step * cardsPerPage,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
    });
  }

  return (
    <div className="mt-6">
      <div className="mb-3 flex justify-end gap-2">
        <button type="button" onClick={() => move(-1)} aria-label={`Previous ${label.toLowerCase()}`} className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold hover:border-sky-500">Previous</button>
        <button type="button" onClick={() => move(1)} aria-label={`Next ${label.toLowerCase()}`} className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold hover:border-sky-500">Next</button>
      </div>
      <div ref={track} role="region" aria-label={label} tabIndex={0} className="grid snap-x snap-mandatory auto-cols-[85%] grid-flow-col gap-3 overflow-x-auto pb-3 sm:auto-cols-[calc((100%-0.75rem)/2)] lg:auto-cols-[calc((100%-2.25rem)/4)] xl:auto-cols-[calc((100%-3rem)/5)]">
        {candidates.map(([name, party], index) => {
          const votes = totals.find(row => row.party === party)?.votes ?? 0;
          const share = totalVotes ? (votes / totalVotes) * 100 : 0;
          return (
            <article key={party} className="flex min-w-0 snap-start flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <span className="text-xs font-black text-slate-400">{String(index + 1).padStart(2, "0")}</span>
              <div className="mt-4 flex items-center gap-3">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-slate-100 text-xs font-black">{initials(name)}</span>
                <PartyLogo party={party} className="h-14 w-14" />
              </div>
              <h3 className="mt-4 break-words font-black leading-snug">{name}</h3>
              <p className="mt-1 text-sm font-bold text-sky-700">{party}</p>
              <div className="mt-auto pt-4">
                <p className="border-t border-slate-100 pt-3 text-xs leading-5 text-slate-500">
                  Live score: <strong className="text-slate-700">{votes.toLocaleString()} votes</strong>
                  {totalVotes !== undefined && <span> ({share.toFixed(1)}%)</span>}
                </p>
                {totalVotes !== undefined && (
                  <progress aria-label={`${party} share of recorded votes`} value={share} max={100} className="mt-2 block h-2 w-full accent-sky-600" />
                )}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
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

function NigeriaMap({data,selectedZone:_selectedZone,selectedState,onSelect}:{data:MapData;selectedZone:string;selectedState:string;onSelect:(state:string)=>void}) {
  const riversFeatures=useMemo(()=>{const wanted=new Set(RIVERS_LGAS.map(normalize));return data.features.filter(feature=>wanted.has(normalize(feature.properties.shapeName)));},[data]);
  const projection = useMemo(()=>{
    const points=riversFeatures.flatMap(feature=>feature.geometry.type==="Polygon"?(feature.geometry.coordinates as number[][][]).flat(1):(feature.geometry.coordinates as number[][][][]).flat(2));
    const xs=points.map(point=>point[0]),ys=points.map(point=>point[1]);const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);const width=620,height=460,padding=18,scale=Math.min((width-padding*2)/(maxX-minX),(height-padding*2)/(maxY-minY));return {width,height,project:([x,y]:number[])=>[padding+(x-minX)*scale,height-(padding+(y-minY)*scale)]};
  },[riversFeatures]);
  function stateName(raw:string){return raw==="Abuja Federal Capital Territory"?"FCT":raw;}
  function path(feature:MapFeature){const polygons=feature.geometry.type==="Polygon"?[feature.geometry.coordinates as number[][][]]:feature.geometry.coordinates as number[][][][];return polygons.flatMap(polygon=>polygon.map(ring=>ring.map((point,index)=>{const [x,y]=projection.project(point);return `${index?"L":"M"}${x.toFixed(1)},${y.toFixed(1)}`;}).join(" ")+" Z")).join(" ");}
  return <svg viewBox={`0 0 ${projection.width} ${projection.height}`} role="img" aria-label="Rivers State map. Select an LGA to open its result" className="mb-7 h-[300px] w-full sm:h-[390px]">{riversFeatures.map(feature=>{const state=stateName(feature.properties.shapeName);const active=normalize(selectedState)===normalize(state);return <path key={state} d={path(feature)} onClick={()=>onSelect(state)} tabIndex={0} onKeyDown={event=>{if(event.key==="Enter"||event.key===" ")onSelect(state);}} aria-label={`Open ${state} result`} fill={active?"#0284c7":"#dbeafe"} stroke={active?"#075985":"#94a3b8"} strokeWidth={active?2.5:1} className="cursor-pointer outline-none transition hover:fill-sky-200 focus:stroke-sky-700"/>;})}</svg>;
}
