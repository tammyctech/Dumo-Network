import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  ArrowRight,
  BarChart3,
  ChevronRight,
  Clock3,
  Database,
  Info,
  LayoutDashboard,
  LogIn,
  Map as MapIcon,
  MapPin,
  Menu,
  Moon,
  Radio,
  RefreshCw,
  ShieldCheck,
  Sun,
  UploadCloud,
  X,
} from "lucide-react";
import { partyColor } from "../constants/partyColors";
import { useBranding } from "../context/branding";
import { PartyLogo } from "../constants/partyLogos";
import { useAuth } from "../context/AuthContext";
import { setTheme, type ThemeMode } from "../context/theme";

const API_URL = import.meta.env.DEV
  ? (import.meta.env.VITE_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "")
  : "";

const RIVERS_GEOJSON_URL =
  "https://media.githubusercontent.com/media/wmgeolab/geoBoundaries/main/" +
  "releaseData/gbOpen/NGA/ADM2/geoBoundaries-NGA-ADM2.geojson";
const RIVERS_LGAS = ["Abua/Odual", "Ahoada East", "Ahoada West", "Akuku-Toru", "Andoni", "Asari-Toru", "Bonny", "Degema", "Eleme", "Emohua", "Etche", "Gokana", "Ikwerre", "Khana", "Obio/Akpor", "Ogba/Egbema/Ndoni", "Ogu/Bolo", "Okrika", "Omuma", "Opobo/Nkoro", "Oyigbo", "Port Harcourt", "Tai"];

type PartyTotal = { party: string; votes: number };
type Election = { id: number; name: string; election_date: string };
type LgaResult = {
  lga: string;
  total_polling_units: number;
  submitted_polling_units: number;
  coverage_percent: number | null;
  leader: PartyTotal | null;
  party_totals: PartyTotal[];
};
type ElectionUpdate = {
  id: number;
  submitted_at: string;
  lga: string;
  ward: string;
  polling_unit_name: string;
  polling_unit_code: string;
  leading_party: PartyTotal | null;
  is_flagged: boolean;
};
type PublicOverview = {
  state: string;
  data_type: string;
  election: Election | null;
  last_updated: string | null;
  total_polling_units: number;
  submitted_polling_units: number;
  submission_coverage_percent: number | null;
  party_totals: PartyTotal[];
  lga_results: LgaResult[];
  updates: ElectionUpdate[];
};
const EMPTY_OVERVIEW: PublicOverview = {
  state: "Rivers",
  data_type: "unofficial_agent_submitted",
  election: null,
  last_updated: null,
  total_polling_units: 0,
  submitted_polling_units: 0,
  submission_coverage_percent: null,
  party_totals: [],
  lga_results: [],
  updates: [],
};
type GeoFeature = {
  type: "Feature";
  properties: { shapeName?: string; ADM2_EN?: string };
  geometry: {
    type: "Polygon" | "MultiPolygon";
    coordinates: number[][][] | number[][][][];
  };
};
type GeoJson = { type: "FeatureCollection"; features: GeoFeature[] };
type IncidentOption = { id: number; name: string };
type IncidentUnit = IncidentOption & { code: string; lga: string; ward: string };

function PublicIncidentSection() {
  const [elections, setElections] = useState<IncidentOption[]>([]);
  const [units, setUnits] = useState<IncidentUnit[]>([]);
  const [selectedLga, setSelectedLga] = useState("");
  const [selectedWard, setSelectedWard] = useState("");
  const [selectedUnit, setSelectedUnit] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const lgas = useMemo(() => [...new Set(units.map(unit => unit.lga))].sort(), [units]);
  const wards = useMemo(() => [...new Set(units.filter(unit => unit.lga === selectedLga).map(unit => unit.ward))].sort(), [units, selectedLga]);
  const pollingUnits = useMemo(() => units.filter(unit => unit.lga === selectedLga && unit.ward === selectedWard), [units, selectedLga, selectedWard]);
  useEffect(() => { void fetch(`${API_URL}/api/operations/public/incidents/options`).then(r => r.ok ? r.json() : Promise.reject()).then(data => { setElections(data.elections || []); setUnits(data.polling_units || []); }).catch(() => setError("Incident reporting options are temporarily unavailable.")); }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    const data = new FormData(event.currentTarget);
    const files = data.getAll("files") as File[];
    if (files.length > 3 || files.some(file => file.size > 100 * 1024 * 1024)) { setError("Choose up to 3 videos, no more than 100 MB each."); setBusy(false); return; }
    try {
      const response = await fetch(`${API_URL}/api/operations/public/incidents`, { method: "POST", body: data });
      if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(typeof body.detail === "string" ? body.detail : "Could not submit the incident report."); }
      event.currentTarget.reset(); setSelectedLga(""); setSelectedWard(""); setSelectedUnit(""); setMessage("Thank you. Your incident and video evidence were sent to the monitoring team.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not submit the incident report."); }
    finally { setBusy(false); }
  }
  return <section id="report-incident" className="scroll-mt-20 border-y border-sky-100 bg-sky-50 py-20 text-slate-950"><div className="mx-auto grid max-w-7xl gap-10 px-5 lg:grid-cols-[0.75fr_1.25fr] lg:px-8"><div><p className="text-sm font-black uppercase tracking-[0.2em] text-sky-700">Community incident reporting</p><h2 className="mt-4 text-4xl font-black tracking-tight text-sky-950 sm:text-5xl">Witnessed something at a polling unit?</h2><p className="mt-5 max-w-xl leading-7 text-slate-600">Send a report with video evidence directly to the election monitoring team. Reports are reviewed privately and are not published automatically.</p><div className="mt-7 flex gap-3 rounded-2xl border border-sky-200 bg-white p-4 text-sm text-sky-950 shadow-sm"><ShieldCheck className="shrink-0 text-sky-700"/><p>Only authorized administrators can access visitor-submitted videos. For immediate danger, contact emergency services first.</p></div></div><form onSubmit={submit} className="grid gap-4 rounded-3xl border border-sky-200 bg-white p-6 text-slate-900 shadow-xl shadow-sky-950/5 sm:grid-cols-2 sm:p-8"><h3 className="text-xl font-black text-sky-950 sm:col-span-2">Report a polling-unit incident</h3>{error&&<p className="rounded-xl bg-red-50 p-3 text-sm text-red-700 sm:col-span-2">{error}</p>}{message&&<p className="rounded-xl bg-sky-50 p-3 text-sm text-sky-800 sm:col-span-2">{message}</p>}<label className="text-sm font-bold">Your name<input name="reporter_name" required minLength={2} maxLength={150} className="input mt-2"/></label><label className="text-sm font-bold">Phone number<input name="reporter_phone" required type="tel" className="input mt-2"/></label><label className="text-sm font-bold sm:col-span-2">Election<select name="election_id" required className="input mt-2"><option value="">Select election</option>{elections.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="text-sm font-bold">LGA<select required value={selectedLga} onChange={event=>{setSelectedLga(event.target.value);setSelectedWard("");setSelectedUnit("");}} className="input mt-2"><option value="">Select LGA</option>{lgas.map(lga=><option key={lga} value={lga}>{lga}</option>)}</select></label><label className="text-sm font-bold">Ward<select required disabled={!selectedLga} value={selectedWard} onChange={event=>{setSelectedWard(event.target.value);setSelectedUnit("");}} className="input mt-2"><option value="">Select ward</option>{wards.map(ward=><option key={ward} value={ward}>{ward}</option>)}</select></label><label className="text-sm font-bold sm:col-span-2">Polling unit<select name="polling_unit_id" required disabled={!selectedWard} value={selectedUnit} onChange={event=>setSelectedUnit(event.target.value)} className="input mt-2"><option value="">Select polling unit</option>{pollingUnits.map(item=><option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label><label className="text-sm font-bold">Category<select name="category" required className="input mt-2"><option value="">Select category</option>{["Violence or intimidation","Vote buying","Equipment failure","Missing or late materials","Access restriction","Result-sheet problem","Other"].map(item=><option key={item}>{item}</option>)}</select></label><label className="text-sm font-bold">Severity<select name="severity" defaultValue="medium" className="input mt-2"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select></label><label className="text-sm font-bold sm:col-span-2">What happened?<textarea name="description" required minLength={5} maxLength={3000} rows={4} className="input mt-2" placeholder="Describe what happened, when it happened, and who may be at risk."/></label><label className="rounded-2xl border-2 border-dashed border-sky-300 bg-sky-50/50 p-5 text-sm font-bold sm:col-span-2"><span className="flex items-center gap-2"><UploadCloud className="text-sky-700"/>Video evidence</span><span className="mt-1 block text-xs font-normal text-slate-500">Upload 1–3 MP4, WebM, or MOV videos. Maximum 100 MB each, suitable for many 5–10 minute phone recordings.</span><input name="files" required type="file" multiple accept="video/mp4,video/webm,video/quicktime" className="mt-3 block w-full text-sm"/></label><button disabled={busy} className="rounded-xl bg-sky-700 px-5 py-3 font-black text-white hover:bg-sky-800 disabled:opacity-50 sm:col-span-2">{busy ? "Submitting report…" : "Submit incident report"}</button></form></div></section>;
}

function normalizeLga(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  const aliases: Record<string, string> = {
    obiaakpor: "obioakpor",
    omumma: "omuma",
  };
  return aliases[normalized] || normalized;
}

function leaderVoteShare(result: LgaResult | undefined): number {
  if (!result?.leader) return 0;
  const total = result.party_totals.reduce(
    (sum, party) => sum + party.votes,
    0
  );
  return total > 0 ? result.leader.votes / total : 0;
}

function formatNumber(value: number | null | undefined): string {
  return value == null ? "—" : value.toLocaleString("en-NG");
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "Awaiting first report";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Awaiting first report";
  return date.toLocaleString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function geometryPoints(feature: GeoFeature): number[][] {
  const coordinates = feature.geometry.coordinates;
  return feature.geometry.type === "Polygon"
    ? (coordinates as number[][][]).flat(1)
    : (coordinates as number[][][][]).flat(2);
}

function MapPanel({
  geoJson,
  lgaResults,
  mapLoading,
  mapError,
  onRetry,
}: {
  geoJson: GeoJson | null;
  lgaResults: LgaResult[];
  mapLoading: boolean;
  mapError: string;
  onRetry: () => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const results = useMemo(
    () => new Map(lgaResults.map((item) => [normalizeLga(item.lga), item])),
    [lgaResults]
  );

  const projection = useMemo(() => {
    if (!geoJson?.features.length) return null;
    const points = geoJson.features.flatMap(geometryPoints);
    const longitudes = points.map((point) => point[0]);
    const latitudes = points.map((point) => point[1]);
    const minX = Math.min(...longitudes);
    const maxX = Math.max(...longitudes);
    const minY = Math.min(...latitudes);
    const maxY = Math.max(...latitudes);
    const width = 450;
    const height = 500;
    const padding = 14;
    const scale = Math.min(
      (width - padding * 2) / (maxX - minX),
      (height - padding * 2) / (maxY - minY)
    );
    const offsetX = (width - (maxX - minX) * scale) / 2;
    const offsetY = (height - (maxY - minY) * scale) / 2;
    const project = ([longitude, latitude]: number[]) => [
      offsetX + (longitude - minX) * scale,
      height - (offsetY + (latitude - minY) * scale),
    ];
    return { width, height, project };
  }, [geoJson]);

  function featurePath(feature: GeoFeature): string {
    if (!projection) return "";
    const polygons =
      feature.geometry.type === "Polygon"
        ? [feature.geometry.coordinates as number[][][]]
        : (feature.geometry.coordinates as number[][][][]);
    return polygons
      .flatMap((polygon) =>
        polygon.map((ring) =>
          ring
            .map((point, index) => {
              const [x, y] = projection.project(point);
              return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
            })
            .join(" ") + " Z"
        )
      )
      .join(" ");
  }

  const selectedResult = selected
    ? results.get(normalizeLga(selected))
    : null;

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(260px,0.55fr)]">
      <div className="relative min-h-[420px] overflow-hidden rounded-2xl border border-slate-200 bg-white p-1 shadow-sm sm:rounded-3xl sm:p-6">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(14,165,233,0.10),transparent_55%)]" />
        {geoJson && projection ? (
          <svg
            viewBox={`0 0 ${projection.width} ${projection.height}`}
            role="img"
            aria-label="Rivers State election leaders by local government area"
            className="relative block h-[400px] w-full drop-shadow-2xl sm:h-[500px] xl:h-[620px]"
          >
            {geoJson.features.map((feature) => {
              const name = feature.properties.shapeName || feature.properties.ADM2_EN || "Unknown LGA";
              const result = results.get(normalizeLga(name));
              const active = selected === name;
              return (
                <path
                  key={name}
                  d={featurePath(feature)}
                  fill={result?.leader ? partyColor(result.leader.party) : "#e0f2fe"}
                  fillOpacity={
                    result?.leader ? 0.5 + leaderVoteShare(result) * 0.5 : 1
                  }
                  stroke={active ? "#0369a1" : "#7dd3fc"}
                  strokeWidth={active ? 3 : 1.5}
                  className="cursor-pointer outline-none transition hover:brightness-125 focus-visible:stroke-sky-900 focus-visible:[stroke-width:3]"
                  onMouseEnter={() => setSelected(name)}
                  onFocus={() => setSelected(name)}
                  onClick={() => setSelected(name)}
                  tabIndex={0}
                  aria-label={`${name}: ${result?.leader?.party || "no result yet"}`}
                />
              );
            })}
          </svg>
        ) : mapLoading ? (
          <div className="flex min-h-[390px] items-center justify-center text-sky-700">
            <RefreshCw size={24} className="mr-3 animate-spin" />
            Loading Rivers State map…
          </div>
        ) : (
          <div className="flex min-h-[390px] flex-col items-center justify-center px-6 text-center text-sky-700">
            <MapIcon size={30} />
            <p className="mt-3 font-semibold text-slate-900">
              {mapError || "Map boundaries are temporarily unavailable"}
            </p>
            <p className="mt-1 max-w-sm text-sm">
              Statewide totals and election updates remain available below. Try again to reload the map.
            </p>
            <button
              type="button"
              onClick={onRetry}
              className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-lg border border-sky-200 bg-white px-3 text-sm font-semibold text-sky-800 hover:bg-sky-50"
            >
              <RefreshCw size={15} />
              Retry map
            </button>
          </div>
        )}
      </div>

      <aside className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-900/5">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-700">
          LGA snapshot
        </p>
        {selectedResult ? (
          <div className="mt-5">
            <h3 className="text-2xl font-black text-slate-950">
              {selectedResult.lga}
            </h3>
            <div className="mt-5 rounded-2xl border border-sky-100 bg-sky-50/70 p-5">
              <p className="text-xs uppercase tracking-widest text-slate-500">
                Current leader
              </p>
              <div className="mt-2 flex items-center gap-3">
                <PartyLogo party={selectedResult.leader?.party} className="h-9 w-9" />
                <span className="text-2xl font-black text-slate-900">
                  {selectedResult.leader?.party || "No report"}
                </span>
              </div>
              <p className="mt-2 text-sm text-slate-600">
                {formatNumber(selectedResult.leader?.votes)} reported votes
              </p>
            </div>
            <div className="mt-5 space-y-3">
              {selectedResult.party_totals.slice(0, 5).map((party) => (
                <div key={party.party} className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                    <PartyLogo party={party.party} className="h-7 w-7" />
                    {party.party}
                  </span>
                  <span className="text-sm font-bold text-slate-950">
                    {formatNumber(party.votes)}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-6 border-t border-slate-200 pt-5">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Reporting coverage</span>
                <strong className="text-slate-900">
                  {selectedResult.coverage_percent?.toFixed(1) || "0.0"}%
                </strong>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-sky-500"
                  style={{
                    width: `${Math.min(
                      selectedResult.coverage_percent || 0,
                      100
                    )}%`,
                  }}
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
            <MapPin className="mx-auto text-sky-600" />
            <p className="mt-3 font-semibold text-slate-800">
              Explore the map
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Hover over or select an LGA to inspect its reported leader and
              coverage.
            </p>
          </div>
        )}
        <p className="mt-6 text-xs leading-5 text-slate-500">
          Grey LGAs have no submitted party totals. A colored LGA shows the
          party currently leading from reports received—not a declared winner.
        </p>
      </aside>
    </div>
  );
}

export default function LandingPage() {
  const branding = useBranding();
  const {user}=useAuth();
  const accountPath=user?"/dashboard":"/login";
  const accountLabel=user?"Go to dashboard":"Sign in";
  const lt = (key: string) => branding.landing_text[key];
  const [overview, setOverview] = useState<PublicOverview | null>(null);
  const [geoJson, setGeoJson] = useState<GeoJson | null>(null);
  const [loading, setLoading] = useState(true);
  const [mapLoading, setMapLoading] = useState(true);
  const [mapError, setMapError] = useState("");
  const [error, setError] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [themeMode,setThemeMode]=useState<ThemeMode>(()=>document.documentElement.classList.contains("dark")?"dark":"light");
  function toggleTheme(){const next=themeMode==="dark"?"light":"dark";setTheme(next);window.localStorage.setItem("dumo-theme-user-set","true");setThemeMode(next)}
  const [refreshKey, setRefreshKey] = useState(0);
  useEffect(() => {
    const elements = document.querySelectorAll<HTMLElement>(
      ".landing-page main > section:not(:first-child), .landing-page main article"
    );
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      elements.forEach((element) => element.classList.add("is-visible"));
      return;
    }
    elements.forEach((element) => element.classList.add("motion-reveal"));
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        });
      },
      { rootMargin: "0px 0px -8%", threshold: 0.08 }
    );
    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [overview]);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setMapLoading(true);
      setMapError("");
      setError("");
      void fetch(RIVERS_GEOJSON_URL, { signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) {
            throw new Error(`Map service returned HTTP ${response.status}.`);
          }
          const boundaries = (await response.json()) as GeoJson;
          if (!Array.isArray(boundaries.features) || boundaries.features.length === 0) {
            throw new Error("The map service returned no Rivers State boundaries.");
          }
          const riversNames = new Set(RIVERS_LGAS.map(normalizeLga));
          const riversBoundaries = {
            ...boundaries,
            features: boundaries.features.filter((feature) => {
              const name = feature.properties.shapeName || feature.properties.ADM2_EN || "";
              return riversNames.has(normalizeLga(name));
            }),
          };
          if (riversBoundaries.features.length === 0) {
            throw new Error("The map source returned no Rivers State LGA boundaries.");
          }
          if (!controller.signal.aborted) setGeoJson(riversBoundaries);
        })
        .catch((caught: unknown) => {
          if (controller.signal.aborted) return;
          setMapError(
            caught instanceof Error
              ? caught.message
              : "Map boundaries could not be loaded."
          );
        })
        .finally(() => {
          if (!controller.signal.aborted) setMapLoading(false);
        });
      try {
        const overviewResponse = await fetch(
          `${API_URL}/api/public/election-overview`,
          { signal: controller.signal }
        );
        if (!overviewResponse.ok) {
          throw new Error("Live election data is temporarily unavailable.");
        }
        const overviewData = (await overviewResponse.json()) as PublicOverview;
        setOverview(overviewData);
      } catch (caught) {
        if (controller.signal.aborted) return;
        setError(
          caught instanceof Error
            ? caught.message
            : "Unable to load live election information."
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          setMapLoading(false);
        }
      }
    }
    void load();
    return () => controller.abort();
  }, [refreshKey]);

  const displayOverview = overview ?? EMPTY_OVERVIEW;
  const leadingParty = displayOverview.party_totals[0] || null;
  const hasUploadedResults = displayOverview.submitted_polling_units > 0;
  const totalVotes =
    displayOverview.party_totals.reduce(
      (sum, party) => sum + party.votes,
      0
    );

  return (
    <div className="landing-page min-h-screen bg-slate-100 text-slate-950">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 text-slate-950 shadow-sm backdrop-blur-xl">
        <div className="mx-auto flex h-[4.5rem] max-w-7xl items-center justify-between px-5 lg:px-8">
          <Link to="/" className="flex items-center gap-3 text-slate-950">
            {branding.logo_data_url ? <img src={branding.logo_data_url} alt="" className="nav-logo-mark h-10 w-10 rounded-xl bg-white object-contain p-1"/> : <span className="nav-logo-mark flex h-10 w-10 items-center justify-center rounded-xl bg-sky-700 text-white"><Activity size={20} strokeWidth={2.5} /></span>}
            <span>
              <span className="block text-sm font-black tracking-[0.12em]">
                {branding.logo_title.toUpperCase()}
              </span>
              <span className="mt-0.5 block text-[10px] uppercase tracking-[0.2em] text-slate-500">
                {branding.logo_subtitle}
              </span>
            </span>
          </Link>

          <nav className="hidden items-center gap-7 md:flex">
            <Link to="/live-results" className="inline-flex items-center gap-2 rounded-xl border border-sky-950/20 bg-white px-3.5 py-2 text-sm font-bold text-sky-950 shadow-sm transition hover:border-sky-950 hover:bg-sky-50 hover:text-sky-950">
              <span className="relative flex h-2.5 w-2.5" aria-hidden="true"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"/><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500"/></span>
              Live results
            </Link>
            <a
              href="#updates"
              className="relative py-2 text-sm font-semibold text-slate-600 transition hover:text-sky-700"
            >
              <span>{lt("nav_updates").text}</span>
            </a>
            <a
              href="#methodology"
              className="relative py-2 text-sm font-semibold text-slate-600 transition hover:text-sky-700"
            >
              <span>{lt("nav_methodology").text}</span>
            </a>
            <a href="#report-incident" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700 hover:bg-red-100">Report incident</a>
            <button type="button" onClick={toggleTheme} className="grid h-11 w-11 place-items-center rounded-xl border border-slate-200 bg-white text-sky-950 transition hover:border-sky-950 hover:bg-sky-50" aria-label={`Turn ${themeMode==="dark"?"on light":"on dark"} mode`}>{themeMode==="dark"?<Sun size={19}/>:<Moon size={19}/>}</button>
            <Link
              to={accountPath}
              className="nav-sign-in group inline-flex min-h-11 items-center gap-2 rounded-xl bg-sky-700 px-4 text-sm font-bold text-white shadow-md transition hover:bg-sky-800"
            >
              {user?<LayoutDashboard size={17} aria-hidden="true"/>:<LogIn size={17} aria-hidden="true"/>}
              <span>{accountLabel}</span>
            </Link>
          </nav>

          <button
            type="button"
            aria-label="Toggle navigation"
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-navigation"
            onClick={() => setMobileMenuOpen((value) => !value)}
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition hover:bg-sky-50 hover:text-sky-700 md:hidden"
          >
            {mobileMenuOpen ? <X /> : <Menu />}
          </button>
        </div>
        {mobileMenuOpen && (
          <nav id="mobile-navigation" className="border-t border-slate-200 bg-white px-5 py-5 shadow-lg md:hidden">
            <div className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
              <Link to="/live-results" onClick={() => setMobileMenuOpen(false)} className="inline-flex items-center gap-2 rounded-xl border border-sky-950/20 bg-white px-3 py-3 font-bold text-sky-950 transition hover:border-sky-950 hover:bg-sky-50 hover:text-sky-950">
                <span className="relative flex h-2.5 w-2.5" aria-hidden="true"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"/><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500"/></span>
                Live results
              </Link>
              <a
                href="#updates"
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-lg px-3 py-3 transition hover:bg-sky-50 hover:text-sky-800"
              >
                <span style={{color:lt("nav_updates").color}}>{lt("nav_updates").text}</span>
              </a>
              <a
                href="#methodology"
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-lg px-3 py-3 transition hover:bg-sky-50 hover:text-sky-800"
              >
                <span style={{color:lt("nav_methodology").color}}>{lt("nav_methodology").text}</span>
              </a>
              <a href="#report-incident" onClick={() => setMobileMenuOpen(false)} className="rounded-lg px-3 py-3 font-bold text-red-700 hover:bg-red-50">Report incident</a>
              <button type="button" onClick={toggleTheme} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 font-bold text-sky-950"><span>{themeMode==="dark"?<Sun size={18}/>:<Moon size={18}/>}</span>{themeMode==="dark"?"Light mode":"Dark mode"}</button>
              <Link
                to={accountPath}
                className="nav-sign-in mt-2 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-sky-700 px-5 font-bold text-white shadow-md transition hover:bg-sky-800"
              >
                {user?<LayoutDashboard size={18} aria-hidden="true"/>:<LogIn size={18} aria-hidden="true"/>}
                <span>{accountLabel}</span>
                <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </div>
          </nav>
        )}
      </header>

      <main>
        <section className="relative isolate overflow-hidden border-b border-slate-200 bg-[#f4f7fa] pb-12 pt-12 text-slate-950 sm:pb-20 sm:pt-20">
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(14,165,233,0.07),transparent_42%),radial-gradient(circle_at_82%_12%,rgba(186,230,253,0.5),transparent_30%)]" />
          <div className="relative mx-auto grid max-w-7xl gap-12 px-5 lg:grid-cols-[1.02fr_0.98fr] lg:items-center lg:gap-16 lg:px-8">
            <div>
              <div className="inline-flex items-center gap-2.5 rounded-lg border border-sky-200 bg-white px-3.5 py-2 text-[11px] font-bold uppercase tracking-[0.15em] text-sky-800 shadow-sm">
                <span className={`relative flex h-2 w-2 ${loading ? "animate-pulse" : ""}`}>
                  <span className="absolute inline-flex h-full w-full rounded-full bg-sky-600 opacity-40" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-sky-600" />
                </span>
                {loading ? "Loading public results · Rivers State" : "Public results · Rivers State"}
              </div>
              <h1 className="mt-7 max-w-2xl text-[2.8rem] font-semibold leading-[1.04] tracking-[-0.055em] text-slate-950 sm:text-6xl lg:text-[4.2rem]">
                <span className="block text-slate-950">{lt("hero_line_1").text}</span>
                <span className="block text-sky-700">{lt("hero_line_2").text}</span>
                <span className="block text-slate-950">{lt("hero_line_3").text}</span>
              </h1>
              <p className="mt-6 max-w-xl text-base leading-7 text-slate-600 sm:text-lg sm:leading-8">
                {lt("hero_description").text}
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <a
                  href="#results"
                  className="landing-hero-cta landing-hero-cta-primary group inline-flex min-h-12 items-center gap-2 rounded-lg bg-sky-700 px-5 py-3 text-sm font-bold text-white shadow-md transition hover:bg-sky-800"
                >
                  <span>{lt("hero_results_button").text}</span>
                </a>
                <Link
                  to={accountPath}
                  className="landing-hero-cta landing-hero-cta-secondary group inline-flex min-h-12 items-center gap-2 rounded-lg border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-800 transition hover:border-sky-300 hover:text-sky-800"
                >
                  {user?<LayoutDashboard size={18} aria-hidden="true"/>:<LogIn size={18} aria-hidden="true"/>}
                  <span>{user?accountLabel:lt("hero_login_button").text}</span>
                </Link>
              </div>
              <div className="mt-8 flex max-w-xl items-start gap-3 border-l-2 border-amber-500 pl-4 text-sm leading-6 text-slate-600">
                <ShieldCheck size={18} className="mt-0.5 shrink-0 text-amber-600" aria-hidden="true" />
                <p>{lt("hero_disclaimer").text}</p>
              </div>
            </div>

            <div className="relative rounded-2xl border border-sky-800/70 bg-white p-5 shadow-[0_32px_90px_-35px_rgba(0,0,0,0.65)] sm:p-7">
              <div className="absolute inset-x-0 top-0 h-1 rounded-t-2xl bg-gradient-to-r from-sky-600 via-sky-400 to-amber-400" />
              <div className="relative flex items-start justify-between gap-4">
                <div>
                  <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-sky-800">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-50"><Activity size={14} aria-hidden="true" /></span>
                    {displayOverview.election ? "Current election" : "Election status"}
                  </p>
                  <h2 className="mt-3 max-w-sm text-lg font-bold leading-snug text-slate-950 sm:text-xl">
                    {displayOverview.election?.name || "No election data available"}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setRefreshKey((value) => value + 1)}
                  aria-label="Refresh election data"
                  title="Refresh election data"
                  disabled={loading}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:border-sky-300 hover:bg-sky-50 hover:text-sky-800 disabled:cursor-wait disabled:opacity-60"
                >
                  <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
                </button>
              </div>
              <div className="relative mt-6 grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-slate-200/80 bg-[#f8faf8] p-4 transition hover:border-sky-200">
                  <p className="text-[11px] font-medium text-slate-500">
                    Reports received
                  </p>
                  <p className="mt-2 text-2xl font-bold tabular-nums tracking-tight text-slate-950 sm:text-3xl">
                    {displayOverview.election
                      ? formatNumber(displayOverview.submitted_polling_units)
                      : "—"}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200/80 bg-[#f8faf8] p-4 transition hover:border-sky-200">
                  <p className="text-[11px] font-medium text-slate-500">
                    State coverage
                  </p>
                  <p className="mt-2 text-2xl font-bold tabular-nums tracking-tight text-slate-950 sm:text-3xl">
                    {displayOverview.submission_coverage_percent == null
                      ? "—"
                      : `${displayOverview.submission_coverage_percent.toFixed(1)}%`}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200/80 bg-[#f8faf8] p-4 transition hover:border-sky-200">
                  <p className="text-[11px] font-medium text-slate-500">Reported votes</p>
                  <p className="mt-2 text-2xl font-bold tabular-nums tracking-tight text-slate-950 sm:text-3xl">
                    {hasUploadedResults ? formatNumber(totalVotes) : "—"}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200/80 bg-[#f8faf8] p-4 transition hover:border-sky-200">
                  <p className="text-[11px] font-medium text-slate-500">Current statewide lead</p>
                  {hasUploadedResults && leadingParty ? <p className="mt-2 flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl"><PartyLogo party={leadingParty.party} className="h-9 w-9"/><span className="truncate">{leadingParty.party}</span></p> : <p className="mt-2 text-2xl font-bold text-slate-950 sm:text-3xl">—</p>}
                </div>
              </div>
              <p className="relative mt-5 flex items-center gap-2 border-t border-slate-200 pt-4 text-xs text-slate-500">
                <Clock3 size={14} /> Last update: {formatDate(displayOverview.last_updated)}
              </p>
            </div>
          </div>
          <div className="relative mx-auto mt-12 grid max-w-7xl grid-cols-1 gap-3 px-5 sm:grid-cols-3 lg:px-8">
            {[
              { label: "Geographic coverage", value: "23 local government areas", icon: MapPin },
              { label: "Reporting model", value: "Polling-unit submissions", icon: Radio },
              { label: "Public status", value: "Provisional & transparent", icon: ShieldCheck },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.label} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-700">
                    <Icon size={17} aria-hidden="true" />
                  </span>
                  <span>
                    <span className="block text-[10px] font-semibold uppercase tracking-[0.13em] text-slate-500">{item.label}</span>
                    <span className="mt-0.5 block text-sm font-semibold text-slate-900">{item.value}</span>
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        <section id="results" className="scroll-mt-24 bg-slate-100 py-16 sm:py-24">
          <div className="mx-auto max-w-7xl px-2 sm:px-5 lg:px-8">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em]" style={{color:lt("map_eyebrow").color}}>
                  {lt("map_eyebrow").text}
                </p>
                <h2 className="mt-3 max-w-3xl text-4xl font-black tracking-[-0.035em] sm:text-5xl" style={{color:lt("map_heading").color}}>
                  {lt("map_heading").text}
                </h2>
              </div>
              <div className="flex max-w-xl items-start gap-3 rounded-2xl border border-sky-200 bg-white p-4 text-base leading-7 text-slate-800 shadow-sm">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-800">
                  <Info size={18} aria-hidden="true" />
                </span>
                <p style={{color:lt("map_description").color}}>{lt("map_description").text}</p>
              </div>
            </div>

            {error && (
              <div role="alert" className="mt-8 rounded-2xl border border-red-200 bg-red-50 p-5 text-red-800">
                {error}
              </div>
            )}

            <div className="mt-8 -mx-1 rounded-2xl border border-slate-200 bg-white p-1 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.25)] sm:mx-0 sm:mt-10 sm:rounded-[1.75rem] sm:p-5">
              <MapPanel
                geoJson={geoJson}
                lgaResults={displayOverview.lga_results}
                mapLoading={mapLoading}
                mapError={mapError}
                onRetry={() => setRefreshKey((value) => value + 1)}
              />
            </div>

            <div className="mt-8 flex flex-wrap gap-3">
              {displayOverview.party_totals.slice(0, 8).map((party) => (
                <div key={party.party} className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm shadow-sm">
                  <PartyLogo party={party.party} className="h-7 w-7" />
                  <strong>{party.party}</strong>
                  <span className="text-slate-500">{formatNumber(party.votes)}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-y border-slate-200/70 bg-white py-20 sm:py-24">
          <div className="mx-auto max-w-7xl px-5 lg:px-8">
            <div className="grid gap-10 lg:grid-cols-[0.72fr_1.28fr] lg:gap-16">
              <div className="lg:sticky lg:top-28 lg:self-start">
                <p className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.2em]" style={{color:lt("totals_eyebrow").color}}><BarChart3 size={15} /> {lt("totals_eyebrow").text}</p>
                <h2 className="mt-4 text-4xl font-black leading-[1.08] tracking-[-0.045em] sm:text-5xl" style={{color:lt("totals_heading").color}}>{lt("totals_heading").text}</h2>
                <p className="mt-5 max-w-md text-sm leading-7" style={{color:lt("totals_description").color}}>
                  {lt("totals_description").text}
                </p>
                <div className="mt-6 flex items-start gap-3 rounded-xl border border-sky-100 bg-sky-50/70 p-4 text-sm leading-6 text-sky-950">
                  <Info size={17} className="mt-0.5 shrink-0 text-sky-700" aria-hidden="true" />
                  <p>Bars compare each party's reported votes with the current highest total. They are not a projection or declaration.</p>
                </div>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-slate-50/70 p-5 sm:p-8">
                <div className="mb-7 flex items-center justify-between border-b border-slate-200 pb-4">
                  <div>
                    <p className="text-sm font-bold text-slate-900">Party totals</p>
                    <p className="mt-1 text-xs text-slate-500">{displayOverview.party_totals.length} reported parties</p>
                  </div>
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-amber-800">Unofficial</span>
                </div>
                <div className="space-y-6">
                {displayOverview.party_totals.slice(0, 7).map((party, index) => {
                  const maximum = displayOverview.party_totals[0]?.votes || 1;
                  const share = totalVotes > 0 ? (party.votes / totalVotes) * 100 : 0;
                  return (
                    <div key={party.party}>
                      <div className="mb-2 flex items-end justify-between gap-4">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="w-5 text-[10px] font-black text-slate-400">{String(index + 1).padStart(2, "0")}</span>
                          <PartyLogo party={party.party} className="h-9 w-9" />
                          <span className="font-black text-slate-900">{party.party}</span>
                        </div>
                        <div className="shrink-0 text-right">
                          <span className="font-black tabular-nums text-slate-950">{formatNumber(party.votes)}</span>
                          <span className="ml-2 text-xs font-semibold tabular-nums text-slate-500">{share.toFixed(1)}%</span>
                        </div>
                      </div>
                      <div
                        className="ml-8 h-2.5 overflow-hidden rounded-full bg-slate-200/80"
                        role="progressbar"
                        aria-label={`${party.party} reported votes compared with the current highest total`}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={Math.round((party.votes / maximum) * 100)}
                      >
                        <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${(party.votes / maximum) * 100}%`, backgroundColor: partyColor(party.party) }} />
                      </div>
                    </div>
                  );
                })}
                {!displayOverview.party_totals.length && (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
                    <BarChart3 className="mx-auto text-slate-400" size={24} aria-hidden="true" />
                    <p className="mt-3 font-semibold text-slate-700">No totals to display yet</p>
                    <p className="mt-1 text-sm text-slate-500">Party totals will appear after the first result submission.</p>
                  </div>
                )}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="updates" className="scroll-mt-24 border-y border-slate-200/80 bg-[#f2f5f2] py-20 text-slate-950 sm:py-24">
          <div className="mx-auto max-w-7xl px-5 lg:px-8">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.2em]" style={{color:lt("updates_eyebrow").color}}><Radio size={14} /> {lt("updates_eyebrow").text}</p>
                <h2 className="mt-3 text-4xl font-bold tracking-[-0.045em] sm:text-5xl" style={{color:lt("updates_heading").color}}>{lt("updates_heading").text}</h2>
              </div>
              <p className="max-w-lg text-sm leading-6" style={{color:lt("updates_description").color}}>{lt("updates_description").text}</p>
            </div>
            <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {displayOverview.updates.slice(0, 9).map((update) => (
                <article key={update.id} className="group rounded-xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-900/[0.03] transition duration-200 hover:-translate-y-1 hover:border-sky-300 hover:shadow-lg hover:shadow-sky-950/[0.06]">
                  <div className="flex items-center justify-between gap-3 text-xs text-slate-500">
                    <span className="rounded-full bg-sky-50 px-2.5 py-1 font-bold text-sky-800">{update.lga}</span>
                    <time>{formatDate(update.submitted_at)}</time>
                  </div>
                  <h3 className="mt-5 text-lg font-bold leading-snug text-slate-900">Result received from {update.polling_unit_name}</h3>
                  <p className="mt-2 text-sm text-slate-600">{update.ward} ward · {update.polling_unit_code}</p>
                  <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4">
                    <span className="text-xs text-slate-500">Reported leader</span>
                    <span className="flex items-center gap-2 font-bold text-slate-800">
                      <PartyLogo party={update.leading_party?.party} className="h-7 w-7" />
                      {update.leading_party?.party || "Pending totals"}
                    </span>
                  </div>
                </article>
              ))}
              {!displayOverview.updates.length && (
                <div className="col-span-full rounded-2xl border border-dashed border-slate-300 bg-white/70 px-6 py-12 text-center">
                  <Radio className="mx-auto text-slate-400" size={25} aria-hidden="true" />
                  <p className="mt-4 font-semibold text-slate-800">No field reports yet</p>
                  <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-slate-500">New polling-unit submissions will appear here when reporting begins.</p>
                </div>
              )}
            </div>
          </div>
        </section>

        <PublicIncidentSection />

        <section
          id="methodology"
          className="relative scroll-mt-20 overflow-hidden border-y border-sky-100 bg-sky-50 py-24"
        >
          <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-sky-200/50 blur-3xl" />
          <div className="relative mx-auto max-w-7xl px-5 lg:px-8">
            <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.2em]" style={{color:lt("method_eyebrow").color}}>{lt("method_eyebrow").text}</p>
                <h2 className="mt-4 max-w-xl text-4xl font-black leading-tight tracking-[-0.035em] sm:text-5xl" style={{color:lt("method_heading").color}}>{lt("method_heading").text}</h2>
                <p className="mt-5 max-w-lg text-base font-medium leading-7" style={{color:lt("method_description").color}}>
                  {lt("method_description").text}
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {[
                  { icon: MapPin, title: "Assigned monitors", text: "Authorized agents submit only for polling units assigned to them." },
                  { icon: Database, title: "Structured records", text: "Votes, accreditation figures, timestamps, and result evidence are stored together." },
                  { icon: BarChart3, title: "Live aggregation", text: "Public totals and LGA leaders are recalculated from received submissions." },
                  { icon: ShieldCheck, title: "Clear status", text: "Every public figure is labeled unofficial and coverage is shown alongside leads." },
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <div key={item.title} className="rounded-2xl border border-sky-200 bg-white p-6 shadow-md shadow-sky-950/5">
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-sky-100 text-sky-700"><Icon size={21} /></div>
                      <h3 className="mt-5 font-black text-slate-950">{item.title}</h3>
                      <p className="mt-2 text-sm leading-6 text-slate-600">{item.text}</p>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="command-center-card mt-14 flex flex-col gap-6 rounded-3xl bg-sky-900 p-7 text-white sm:flex-row sm:items-center sm:justify-between sm:p-10">
              <div>
                <p className="text-sm font-bold" style={{color:lt("cta_label").color}}>{lt("cta_label").text}</p>
                <h3 className="command-center-title mt-2 text-3xl font-black" style={{color:lt("cta_heading").color}}>{lt("cta_heading").text}</h3>
              </div>
              <Link
                to={accountPath}
                className="group inline-flex min-h-13 shrink-0 items-center justify-center gap-2 rounded-full bg-sky-800 px-6 py-3.5 font-black text-white shadow-xl shadow-sky-950/20 transition duration-200 hover:-translate-y-0.5 hover:bg-sky-700 hover:shadow-sky-950/30 active:translate-y-0"
              >
                {user?<LayoutDashboard size={18} aria-hidden="true"/>:<LogIn size={18} aria-hidden="true"/>}
                <span style={{color:lt("cta_button").color}}>{user?accountLabel:lt("cta_button").text}</span>
                <ChevronRight
                  size={18}
                  aria-hidden="true"
                  className="transition-transform group-hover:translate-x-1"
                />
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/10 bg-sky-950 py-8 text-sky-100">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-5 text-sm sm:flex-row sm:items-center sm:justify-between lg:px-8">
          <div className="flex items-center gap-3">
            {branding.logo_data_url ? <img src={branding.logo_data_url} alt={`${branding.logo_title} logo`} className="h-11 w-11 rounded-xl bg-white object-contain p-1"/> : <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 text-white"><Activity size={20}/></span>}
            <div><strong className="block text-white">{branding.logo_title}</strong><span className="text-sky-200">{branding.logo_subtitle}</span></div>
          </div>
          <p className="text-sky-200"><strong className="text-white">Transparent by design.</strong> Figures remain unofficial until declared by the authorized electoral body.</p>
          <a href="https://github.com/wmgeolab/geoBoundaries" target="_blank" rel="noreferrer" className="text-sky-100 hover:text-white">Map boundary source <ArrowRight size={13} className="inline"/></a>
        </div>
      </footer>

    </div>
  );
}
