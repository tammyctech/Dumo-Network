import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, Moon, Share2, ShieldCheck, Sun } from "lucide-react";
import { PartyLogo } from "../constants/partyLogos";
import { partyColor } from "../constants/partyColors";
import { useBranding } from "../context/branding";
import { useTheme } from "../context/theme";
import "./public-pages.css";

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

const RIVERS_MAP_URL = "/data/rivers-lgas.geojson";
type MapFeature = { properties: { shapeName: string }; geometry: { type: "Polygon" | "MultiPolygon"; coordinates: number[][][] | number[][][][] } };
type MapData = { features: MapFeature[] };
type PartyTotal={party:string;votes:number};
type LgaResult={lga:string;total_wards:number;total_polling_units:number;submitted_polling_units:number;coverage_percent:number|null;leader:PartyTotal|null;leader_percentage:number;party_totals:PartyTotal[]};
type PublicUpdate = { id: number; lga: string; ward: string; polling_unit_name: string; polling_unit_code: string; submitted_at: string };
type Overview={election:{id:number;name:string;election_date:string}|null;total_polling_units:number;submitted_polling_units:number;submission_coverage_percent:number|null;party_totals:PartyTotal[];lga_results:LgaResult[];last_updated:string|null;updates?:PublicUpdate[]};
const API=import.meta.env.DEV?(import.meta.env.VITE_API_URL||"http://127.0.0.1:8000").replace(/\/$/,""):"";
const normalize=(value:string)=>{
  const normalized=value.toLowerCase().replace(/[^a-z]/g,"");
  const aliases:Record<string,string>={emuoha:"emohua",omumma:"omuma"};
  return aliases[normalized]||normalized;
};

export default function LiveResults() {
  const branding = useBranding();
  const { mode, toggleTheme } = useTheme();
  const [feedState, setFeedState] = useState<"loading" | "ready" | "error">("loading");
  const [search, setSearch] = useState("");
  const [electionFilter, setElectionFilter] = useState("");
  const [reportFilter, setReportFilter] = useState({ lga: "", ward: "", unit: "" });
  const [race,setRace]=useState<"governorship"|"presidential">("governorship");
  const [selectedZone] = useState("Rivers State");
  const [selectedState, setSelectedState] = useState("Port Harcourt");
  const [overview,setOverview]=useState<Overview>({election:null,total_polling_units:0,submitted_polling_units:0,submission_coverage_percent:0,party_totals:[],lga_results:[],last_updated:null});
  const [mapData, setMapData] = useState<MapData | null>(null);
  const [mapError, setMapError] = useState("");
  const [now, setNow] = useState(()=>new Date());
  useEffect(() => { const controller = new AbortController(); void fetch(RIVERS_MAP_URL, {signal:controller.signal}).then(response => response.ok ? response.json() : Promise.reject(new Error("Map boundaries could not be loaded."))).then(setMapData).catch(error=>{if(!controller.signal.aborted)setMapError(error instanceof Error?error.message:"Map boundaries could not be loaded.");}); return ()=>controller.abort(); }, []);
  useEffect(() => {
    const controller = new AbortController();
    const query = electionFilter ? `?race=${encodeURIComponent(electionFilter)}` : "";
    const load = async () => {
      try {
        const response = await fetch(`${API}/api/public/election-overview${query}`, { signal: controller.signal });
        if (!response.ok) throw new Error("Election overview unavailable");
        const data: Overview = await response.json();
        if (controller.signal.aborted) return;
        setOverview(data);
        setRace(data.election?.name.toLowerCase().includes("president") ? "presidential" : "governorship");
        setFeedState("ready");
      } catch {
        if (!controller.signal.aborted) setFeedState("error");
      }
    };
    void load();
    const timer = window.setInterval(load, 60000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [electionFilter]);
  useEffect(() => { const timer=window.setInterval(()=>setNow(new Date()),1000); return ()=>window.clearInterval(timer); }, []);
  const visibleStates = useMemo(
    () => RIVERS_LGAS,
    [],
  );
  const lgaByName=useMemo(()=>new Map(overview.lga_results.map(row=>[normalize(row.lga),row])),[overview.lga_results]);
  const activeLga=lgaByName.get(normalize(selectedState));
  const totalVotes=overview.party_totals.reduce((sum,row)=>sum+row.votes,0);
  const candidates = race === "governorship" ? GOVERNORSHIP_candidates : PRESIDENTIAL_candidates;
  const electionDay = overview.election?.election_date
    ? new Date(overview.election.election_date)
    : race === "governorship" ? GOVERNORSHIP_ELECTION_DAY : PRESIDENTIAL_ELECTION_DAY;
  const remaining = Math.max(0, electionDay.getTime() - now.getTime());
  const countdown = [
    ["Days", Math.floor(remaining / 86400000)],
    ["Hours", Math.floor(remaining / 3600000) % 24],
    ["Minutes", Math.floor(remaining / 60000) % 60],
    ["Seconds", Math.floor(remaining / 1000) % 60],
  ] as const;
  const coverage = overview.submission_coverage_percent;
  const hasElection = feedState !== "loading" && Boolean(overview.election);
  const hasReports = hasElection && overview.submitted_polling_units > 0;
  const dateFormat = new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeZone: "Africa/Lagos" });
  const number = (value: number | undefined) => value == null ? "—" : value.toLocaleString("en-NG");
  const metrics = [
    ["Expected polling units", hasElection || feedState === "ready" ? overview.total_polling_units : undefined],
    ["Units reporting", hasElection ? overview.submitted_polling_units : undefined],
    ["Outstanding units", hasElection ? Math.max(0, overview.total_polling_units - overview.submitted_polling_units) : undefined],
    ["Recorded votes", hasReports ? totalVotes : undefined],
  ] as const;
  const matchingLgas = visibleStates.filter(lga => lga.toLowerCase().includes(search.trim().toLowerCase()));
  const updates = hasElection ? overview.updates ?? [] : [];
  const lgaUpdates = updates.filter(update => !reportFilter.lga || update.lga === reportFilter.lga);
  const wardUpdates = lgaUpdates.filter(update => !reportFilter.ward || update.ward === reportFilter.ward);
  const visibleUpdates = wardUpdates.filter(update => !reportFilter.unit || update.polling_unit_code === reportFilter.unit);
  const updateLgas = [...new Set(updates.map(update => update.lga))].sort();
  const updateWards = [...new Set(lgaUpdates.map(update => update.ward))].sort();
  const updateUnits = [...new Map(wardUpdates.map(update => [update.polling_unit_code, update.polling_unit_name]))];
  const coverageRows = overview.lga_results.filter(row => row.coverage_percent != null);

  return (
    <div className="public-page results-page">
      <header className="public-nav">
        <div className="public-container flex min-h-16 flex-wrap items-center justify-between gap-2 py-2">
          <Link to="/" className="flex min-w-0 items-center gap-2 font-bold">
            {branding.logo_data_url
              ? <img src={branding.logo_data_url} alt="" className="h-9 w-9 shrink-0 rounded-lg object-contain"/>
              : <span className="public-brand-icon"><Activity size={18}/></span>}
            <span className="break-words">{branding.logo_title}</span>
          </Link>
          <div className="flex items-center gap-2">
            {typeof navigator.share === "function" && (
              <button type="button" className="public-icon" aria-label="Share election results"
                onClick={() => void navigator.share({ title: overview.election?.name ?? "Rivers State results", url: window.location.href }).catch(() => undefined)}>
                <Share2 size={18}/>
              </button>
            )}
            <button type="button" className="public-icon" onClick={toggleTheme}
              aria-label={mode === "dark" ? "Switch to light mode" : "Switch to dark mode"}>
              {mode === "dark" ? <Sun size={18}/> : <Moon size={18}/>}
            </button>
            <Link to="/login" className="public-button">Sign in</Link>
          </div>
        </div>
      </header>

      <main>
        <section className="results-intro">
          <div className="public-container results-intro-grid">
            <div className="min-w-0">
              <p className="public-kicker">Rivers State election results</p>
              <h1>{overview.election?.name ?? "Rivers State results explorer"}</h1>
              <p className="public-muted mt-3">
                {hasElection ? `${race === "governorship" ? "Governorship" : "Presidential"} · ${dateFormat.format(electionDay)}` : "Public polling-unit reporting and geographic breakdowns."}
              </p>
              <p className="mt-4" role="status">
                {feedState === "loading" ? "Loading election data…" :
                  feedState === "error" ? (hasElection ? "Refresh failed. Showing the last available results." : "Election data is temporarily unavailable.") :
                  !hasElection ? "No active public election" : hasReports ? "Unofficial reports received" :
                  remaining > 0 ? "Pre-election · No reports received" : "Awaiting polling-unit reports"}
              </p>
              {overview.last_updated && <p className="public-muted mt-2 text-sm">Updated {new Date(overview.last_updated).toLocaleString("en-NG", { timeZone: "Africa/Lagos", dateStyle: "medium", timeStyle: "short" })} WAT</p>}
              <label className="mt-4 block max-w-xs text-sm font-semibold">Election
                <select className="public-field" value={electionFilter} onChange={event => {
                  setFeedState("loading");
                  setOverview({ election: null, total_polling_units: 0, submitted_polling_units: 0, submission_coverage_percent: null, party_totals: [], lga_results: [], last_updated: null });
                  setReportFilter({ lga: "", ward: "", unit: "" });
                  setElectionFilter(event.target.value);
                }}>
                  <option value="">Current public election</option>
                  <option value="governorship">Governorship</option>
                  <option value="presidential">Presidential</option>
                </select>
              </label>
            </div>
            <aside className="public-card">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-semibold">Reporting progress</h2>
                <strong className="results-number">{hasElection && coverage != null ? `${coverage}%` : "—"}</strong>
              </div>
              {hasElection && coverage != null && <progress className="public-progress mt-3" aria-label="Polling-unit reporting completion" value={coverage} max={100}/>}
              <p className="public-muted mt-2 text-sm">{hasElection ? `${number(overview.submitted_polling_units)} of ${number(overview.total_polling_units)} polling units reporting` : "Reporting figures are unavailable."}</p>
            </aside>
            <div className="results-metrics">
              {metrics.map(([label, value]) => <div key={label} className="public-card">
                <span className="public-muted text-sm">{label}</span>
                <strong className="results-number mt-2 block">{number(value)}</strong>
              </div>)}
            </div>
            <p className="results-disclaimer"><ShieldCheck size={20} className="shrink-0"/> Figures are unofficial, agent-submitted data. Only the authorized electoral body can declare official results.</p>
          </div>
        </section>

        {hasElection && !hasReports && remaining > 0 && (
          <section className="public-container results-section">
            <div className="public-card">
              <h2 className="results-heading">Until election day</h2>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {countdown.map(([label, value]) => <div key={label} className="results-inset">
                  <strong className="results-number block">{String(value).padStart(2, "0")}</strong>
                  <span className="public-muted text-sm">{label}</span>
                </div>)}
              </div>
            </div>
          </section>
        )}

        <section id="geography" className="public-container results-section">
          <div className="results-section-heading">
            <div><p className="public-kicker">Geographic breakdown</p><h2 className="results-heading">Explore Rivers State</h2></div>
            <p className="public-muted text-sm">Rivers State / {selectedState}</p>
          </div>
          <div className="results-map-grid">
            <div className="public-card min-w-0">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm font-semibold">Find an LGA
                  <input className="public-field" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search by name"/>
                </label>
                <label className="text-sm font-semibold">Selected LGA
                  <select className="public-field" value={selectedState} onChange={event => setSelectedState(event.target.value)}>
                    {!matchingLgas.includes(selectedState) && <option>{selectedState}</option>}
                    {matchingLgas.map(lga => <option key={lga}>{lga}</option>)}
                  </select>
                </label>
              </div>
              {search && <button type="button" className="public-icon mt-2 px-3" onClick={() => { setSearch(""); setSelectedState("Port Harcourt"); }}>Reset filters</button>}
              {matchingLgas.length === 0 && <p className="public-muted mt-2 text-sm">No LGAs match your search.</p>}
              <div className="results-inset mt-4">
                {mapData ? <NigeriaMap data={mapData} selectedZone={selectedZone} selectedState={selectedState}
                  onSelect={lga => setSelectedState(visibleStates.find(name => normalize(name) === normalize(lga)) ?? lga)}/>
                  : <p className="public-muted py-12 text-center" role="status">{mapError || "Loading Rivers State map…"}</p>}
                <p className="public-muted text-center text-sm">Blue highlights the selected LGA.</p>
              </div>
            </div>
            <aside className="public-card min-w-0" aria-live="polite">
              <h3 className="text-xl font-bold">{selectedState}</h3>
              <dl className="mt-4 grid grid-cols-2 gap-2">
                {[
                  ["Wards", number(activeLga?.total_wards)],
                  ["Polling units", number(activeLga?.total_polling_units)],
                  ["Units reporting", number(activeLga?.submitted_polling_units)],
                  ["Reporting coverage", activeLga?.coverage_percent == null ? "—" : `${activeLga.coverage_percent}%`],
                  ["Leading reported party", activeLga?.leader?.party ?? "—"],
                  ["Share of reported votes", activeLga?.leader == null ? "—" : `${activeLga.leader_percentage}%`],
                ].map(([label, value]) => <div key={label} className="results-inset"><dt className="public-muted text-sm">{label}</dt><dd className="mt-1 text-lg font-bold">{value}</dd></div>)}
              </dl>
              <details className="mt-5">
                <summary className="cursor-pointer py-2 font-semibold">Reported votes by party</summary>
                {activeLga?.party_totals.length ? <table className="results-table">
                  <thead><tr><th scope="col">Party</th><th scope="col">Votes</th></tr></thead>
                  <tbody>{activeLga.party_totals.map(row => <tr key={row.party}><th scope="row">{row.party}</th><td>{number(row.votes)}</td></tr>)}</tbody>
                </table> : <p className="public-muted mt-2 text-sm">No party totals are available for this LGA.</p>}
              </details>
            </aside>
          </div>
          {coverageRows.length > 0 && <details className="public-card mt-4">
            <summary className="cursor-pointer py-2 font-semibold">Reporting progress by LGA</summary>
            <ul className="results-coverage-chart mt-3">
              {coverageRows.map(row => <li key={row.lga} className="results-inset">
                <div className="flex items-start justify-between gap-2 text-sm">
                  <span>{row.lga}</span><strong>{row.coverage_percent}%</strong>
                </div>
                <progress className="public-progress mt-2" value={row.coverage_percent ?? 0} max={100}
                  aria-label={`${row.lga} reporting coverage`}
                  title={`${number(row.submitted_polling_units)} of ${number(row.total_polling_units)} units reporting`}/>
              </li>)}
            </ul>
          </details>}
        </section>

        <section className="public-container results-section">
          <div className="results-section-heading">
            <h2 className="results-heading">Recent polling-unit reports</h2>
            <p className="public-muted text-sm">Filters apply to the latest reports in the public feed.</p>
          </div>
          <div className="public-card">
            {updates.length > 0 ? <>
              <div className="grid gap-3 md:grid-cols-3">
                <label className="text-sm font-semibold">LGA
                  <select className="public-field" value={reportFilter.lga}
                    onChange={event => setReportFilter({ lga: event.target.value, ward: "", unit: "" })}>
                    <option value="">All LGAs</option>
                    {updateLgas.map(lga => <option key={lga}>{lga}</option>)}
                  </select>
                </label>
                <label className="text-sm font-semibold">Ward
                  <select className="public-field" disabled={!reportFilter.lga} value={reportFilter.ward}
                    onChange={event => setReportFilter({ ...reportFilter, ward: event.target.value, unit: "" })}>
                    <option value="">All wards</option>
                    {updateWards.map(ward => <option key={ward}>{ward}</option>)}
                  </select>
                </label>
                <label className="text-sm font-semibold">Polling unit
                  <select className="public-field" disabled={!reportFilter.ward} value={reportFilter.unit}
                    onChange={event => setReportFilter({ ...reportFilter, unit: event.target.value })}>
                    <option value="">All polling units</option>
                    {updateUnits.map(([code, name]) => <option key={code} value={code}>{name} · {code}</option>)}
                  </select>
                </label>
              </div>
              {reportFilter.lga && <button type="button" className="public-icon mt-3 px-3"
                onClick={() => setReportFilter({ lga: "", ward: "", unit: "" })}>Reset report filters</button>}
              <ul className="results-recent mt-3">
                {visibleUpdates.map(update => <li key={update.id}>
                  <div><strong>{update.polling_unit_name}</strong><p className="public-muted text-sm">{update.lga} / {update.ward} / {update.polling_unit_code}</p></div>
                  <time className="public-muted text-sm" dateTime={update.submitted_at}>{new Date(update.submitted_at).toLocaleString("en-NG", { timeZone: "Africa/Lagos", dateStyle: "medium", timeStyle: "short" })} WAT</time>
                </li>)}
              </ul>
              {visibleUpdates.length === 0 && <p className="public-muted mt-3">No recent reports match these filters.</p>}
            </> : <p className="public-muted">No recent polling-unit reports are available.</p>}
          </div>
        </section>

        <section id="spread-analysis" className="public-container results-section">
          <div className="results-section-heading">
            <div><p className="public-kicker">Statewide breakdown</p><h2 className="results-heading">Candidate results</h2></div>
            <p className="public-muted text-sm">{hasReports ? "Share of recorded votes" : "No reported candidate totals yet"}</p>
          </div>
          {hasElection ? <div className="results-candidates">
            {candidates.map(([name, party]) => {
              const votes = overview.party_totals.find(row => row.party === party)?.votes;
              const share = votes != null && totalVotes > 0 ? votes / totalVotes * 100 : null;
              return <article key={party} className="public-card results-candidate">
                <div className="flex min-w-0 items-start gap-3">
                  <PartyLogo party={party} className="h-11 w-11 shrink-0"/>
                  <div className="min-w-0"><h3 className="break-words font-semibold">{name}</h3><p className="public-muted text-sm">{party}</p></div>
                </div>
                <div className="mt-auto pt-4"><strong className="results-number">{number(votes)}</strong> <span className="public-muted text-sm">votes</span></div>
                {share != null ? <div className="mt-2">
                  <progress className="public-progress" aria-label={`${party} share of recorded votes`} value={share} max={100} style={{ accentColor: partyColor(party) }}/>
                  <span className="public-muted text-sm">{share.toFixed(1)}%</span>
                </div> : <p className="public-muted mt-2 text-sm">Vote share unavailable</p>}
              </article>;
            })}
          </div> : <p className="public-card public-muted">Candidate results appear when a public election is available.</p>}
        </section>
      </main>

      <footer className="public-footer"><div className="public-container flex flex-wrap items-center justify-between gap-3">
        <strong>{branding.logo_title}</strong><Link to="/">Back to the public homepage</Link>
      </div></footer>
    </div>
  );
}

function NigeriaMap({data,selectedZone:_selectedZone,selectedState,onSelect}:{data:MapData;selectedZone:string;selectedState:string;onSelect:(state:string)=>void}) {
  const riversFeatures=useMemo(()=>{const wanted=new Set(RIVERS_LGAS.map(normalize));return data.features.filter(feature=>wanted.has(normalize(feature.properties.shapeName)));},[data]);
  const projection = useMemo(()=>{
    const points=riversFeatures.flatMap(feature=>feature.geometry.type==="Polygon"?(feature.geometry.coordinates as number[][][]).flat(1):(feature.geometry.coordinates as number[][][][]).flat(2));
    const xs=points.map(point=>point[0]),ys=points.map(point=>point[1]);const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);const width=620,height=460,padding=18,scale=Math.min((width-padding*2)/(maxX-minX),(height-padding*2)/(maxY-minY));return {width,height,project:([x,y]:number[])=>[padding+(x-minX)*scale,height-(padding+(y-minY)*scale)]};
  },[riversFeatures]);
  function stateName(raw:string){return raw==="Abuja Federal Capital Territory"?"FCT":raw;}
  function path(feature:MapFeature){const polygons=feature.geometry.type==="Polygon"?[feature.geometry.coordinates as number[][][]]:feature.geometry.coordinates as number[][][][];return polygons.flatMap(polygon=>polygon.map(ring=>ring.map((point,index)=>{const [x,y]=projection.project(point);return `${index?"L":"M"}${x.toFixed(1)},${y.toFixed(1)}`;}).join(" ")+" Z")).join(" ");}
  return <svg viewBox={`0 0 ${projection.width} ${projection.height}`} role="img" aria-label="Rivers State map. Select an LGA to open its result" className="results-map">{riversFeatures.map(feature=>{const state=stateName(feature.properties.shapeName);const active=normalize(selectedState)===normalize(state);return <path key={state} d={path(feature)} onClick={()=>onSelect(state)} tabIndex={0} onKeyDown={event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();onSelect(state);}}} aria-label={`Open ${state} result`} fill={active?"var(--public-accent)":"var(--public-map-idle)"} stroke="var(--public-map-stroke)" strokeWidth={active?2.5:1} className="results-map-region"><title>{state}</title></path>;})}</svg>;
}
