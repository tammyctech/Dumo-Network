import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  ArrowRight,
  BarChart3,
  ChevronRight,
  Clock3,
  Database,
  Info,
  LogIn,
  Map as MapIcon,
  MapPin,
  Menu,
  Radio,
  RefreshCw,
  ShieldCheck,
  X,
} from "lucide-react";

const API_URL = (
  import.meta.env.VITE_API_URL || "http://127.0.0.1:8000"
).replace(/\/$/, "");

const RIVERS_GEOJSON_URL =
  "https://services3.arcgis.com/7J7WB6yJX0pYke9q/ArcGIS/rest/services/" +
  "LGAs_Boundaries/FeatureServer/2/query?" +
  "where=ADM1_EN%3D%27Rivers%27&outFields=ADM2_EN%2CADM1_EN&" +
  "returnGeometry=true&f=geojson&outSR=4326";

const PARTY_COLORS = [
  "#059669",
  "#2563eb",
  "#dc2626",
  "#d97706",
  "#7c3aed",
  "#0891b2",
  "#db2777",
  "#4f46e5",
];

const PARTY_COLOR_BY_NAME: Record<string, string> = {
  PDP: "#16a34a",
  APC: "#2563eb",
  SDP: "#dc2626",
  LP: "#7c3aed",
  APGA: "#d97706",
  NNPP: "#0891b2",
  OTHERS: "#64748b",
};

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
  properties: { ADM2_EN?: string };
  geometry: {
    type: "Polygon" | "MultiPolygon";
    coordinates: number[][][] | number[][][][];
  };
};
type GeoJson = { type: "FeatureCollection"; features: GeoFeature[] };

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

function partyColor(party: string | undefined): string {
  if (!party) return "#cbd5e1";
  const normalizedParty = party.trim().toUpperCase();
  if (PARTY_COLOR_BY_NAME[normalizedParty]) {
    return PARTY_COLOR_BY_NAME[normalizedParty];
  }
  let hash = 0;
  for (const character of normalizedParty) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }
  return PARTY_COLORS[hash % PARTY_COLORS.length];
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
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(16,185,129,0.08),transparent_55%)]" />
        {geoJson && projection ? (
          <svg
            viewBox={`0 0 ${projection.width} ${projection.height}`}
            role="img"
            aria-label="Rivers State election leaders by local government area"
            className="relative block h-[400px] w-full drop-shadow-2xl sm:h-[500px] xl:h-[620px]"
          >
            {geoJson.features.map((feature) => {
              const name = feature.properties.ADM2_EN || "Unknown LGA";
              const result = results.get(normalizeLga(name));
              const active = selected === name;
              return (
                <path
                  key={name}
                  d={featurePath(feature)}
                  fill={result?.leader ? partyColor(result.leader.party) : "#e8f3ed"}
                  fillOpacity={
                    result?.leader ? 0.5 + leaderVoteShare(result) * 0.5 : 1
                  }
                  stroke={active ? "#047857" : "#86a995"}
                  strokeWidth={active ? 3 : 1.5}
                  className="cursor-pointer outline-none transition hover:brightness-125 focus-visible:stroke-emerald-900 focus-visible:[stroke-width:3]"
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
          <div className="flex min-h-[390px] items-center justify-center text-emerald-700">
            <RefreshCw size={24} className="mr-3 animate-spin" />
            Loading Rivers State map…
          </div>
        ) : (
          <div className="flex min-h-[390px] flex-col items-center justify-center px-6 text-center text-emerald-700">
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
              className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-lg border border-emerald-200 bg-white px-3 text-sm font-semibold text-emerald-800 hover:bg-emerald-50"
            >
              <RefreshCw size={15} />
              Retry map
            </button>
          </div>
        )}
      </div>

      <aside className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-900/5">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">
          LGA snapshot
        </p>
        {selectedResult ? (
          <div className="mt-5">
            <h3 className="text-2xl font-black text-slate-950">
              {selectedResult.lga}
            </h3>
            <div className="mt-5 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-5">
              <p className="text-xs uppercase tracking-widest text-slate-500">
                Current leader
              </p>
              <div className="mt-2 flex items-center gap-3">
                <span
                  className="h-3 w-3 rounded-full"
                  style={{
                    backgroundColor: partyColor(
                      selectedResult.leader?.party
                    ),
                  }}
                />
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
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: partyColor(party.party) }}
                    />
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
                  className="h-full rounded-full bg-emerald-500"
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
            <MapPin className="mx-auto text-emerald-600" />
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
  const [overview, setOverview] = useState<PublicOverview | null>(null);
  const [geoJson, setGeoJson] = useState<GeoJson | null>(null);
  const [loading, setLoading] = useState(true);
  const [mapLoading, setMapLoading] = useState(true);
  const [mapError, setMapError] = useState("");
  const [error, setError] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
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
          if (!controller.signal.aborted) setGeoJson(boundaries);
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
    <div className="landing-page min-h-screen bg-[#f5f7f6] text-slate-950">
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/95 shadow-sm shadow-slate-900/[0.03] backdrop-blur-xl">
        <div className="mx-auto flex h-[4.5rem] max-w-7xl items-center justify-between px-5 lg:px-8">
          <Link to="/" className="flex items-center gap-3 text-slate-950">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-700 text-white shadow-md shadow-emerald-950/15">
              <Activity size={20} strokeWidth={2.5} />
            </span>
            <span>
              <span className="block text-sm font-black tracking-[0.12em]">
                DUMO YOUTH NETWORK
              </span>
              <span className="mt-0.5 block text-[9px] uppercase tracking-[0.2em] text-slate-500">
                Election Monitoring System
              </span>
            </span>
          </Link>

          <nav className="hidden items-center gap-8 md:flex">
            <a
              href="#results"
              className="relative py-2 text-sm font-semibold text-slate-600 transition-colors duration-200 after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:origin-left after:scale-x-0 after:rounded-full after:bg-emerald-700 after:transition-transform after:duration-200 after:content-[''] hover:text-emerald-800 hover:after:scale-x-100"
            >
              Live results
            </a>
            <a
              href="#updates"
              className="relative py-2 text-sm font-semibold text-slate-600 transition-colors duration-200 after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:origin-left after:scale-x-0 after:rounded-full after:bg-emerald-700 after:transition-transform after:duration-200 after:content-[''] hover:text-emerald-800 hover:after:scale-x-100"
            >
              Updates
            </a>
            <a
              href="#methodology"
              className="relative py-2 text-sm font-semibold text-slate-600 transition-colors duration-200 after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:origin-left after:scale-x-0 after:rounded-full after:bg-emerald-700 after:transition-transform after:duration-200 after:content-[''] hover:text-emerald-800 hover:after:scale-x-100"
            >
              Methodology
            </a>
            <Link
              to="/login"
              className="group inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-700 px-4 text-sm font-bold text-white shadow-md shadow-emerald-950/15 transition duration-200 hover:-translate-y-0.5 hover:bg-emerald-800 active:translate-y-0"
            >
              <LogIn size={17} aria-hidden="true" />
              Monitor login
              <ArrowRight
                size={15}
                aria-hidden="true"
                className="transition-transform group-hover:translate-x-0.5"
              />
            </Link>
          </nav>

          <button
            type="button"
            aria-label="Toggle navigation"
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-navigation"
            onClick={() => setMobileMenuOpen((value) => !value)}
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800 md:hidden"
          >
            {mobileMenuOpen ? <X /> : <Menu />}
          </button>
        </div>
        {mobileMenuOpen && (
          <nav id="mobile-navigation" className="border-t border-slate-200 bg-white px-5 py-5 shadow-lg md:hidden">
            <div className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
              <a
                href="#results"
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-lg px-3 py-3 transition hover:bg-emerald-50 hover:text-emerald-800"
              >
                Live results
              </a>
              <a
                href="#updates"
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-lg px-3 py-3 transition hover:bg-emerald-50 hover:text-emerald-800"
              >
                Updates
              </a>
              <a
                href="#methodology"
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-lg px-3 py-3 transition hover:bg-emerald-50 hover:text-emerald-800"
              >
                Methodology
              </a>
              <Link
                to="/login"
                className="mt-2 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 font-bold text-white shadow-md transition hover:bg-emerald-800"
              >
                <LogIn size={18} aria-hidden="true" />
                Monitor login
                <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </div>
          </nav>
        )}
      </header>

      <main>
        <section className="relative isolate overflow-hidden border-b border-emerald-950/5 bg-[#f7f8f5] pb-16 pt-14 text-slate-950 sm:pb-20 sm:pt-20">
          <div className="pointer-events-none absolute -right-36 -top-40 h-[34rem] w-[34rem] rounded-full border border-emerald-900/[0.06]" />
          <div className="pointer-events-none absolute -right-16 -top-20 h-[25rem] w-[25rem] rounded-full border border-emerald-900/[0.06]" />
          <div className="pointer-events-none absolute right-[8%] top-12 h-80 w-80 rounded-full bg-emerald-200/30 blur-3xl" />
          <div className="relative mx-auto grid max-w-7xl gap-12 px-5 lg:grid-cols-[1.02fr_0.98fr] lg:items-center lg:gap-16 lg:px-8">
            <div>
              <div className="inline-flex items-center gap-2.5 rounded-full border border-slate-200 bg-white/80 px-3.5 py-2 text-[10px] font-bold uppercase tracking-[0.15em] text-slate-600 shadow-sm">
                <span className={`relative flex h-2 w-2 ${loading ? "animate-pulse" : ""}`}>
                  <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-600 opacity-40" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-600" />
                </span>
                {loading ? "Loading public results · Rivers State" : "Public results · Rivers State"}
              </div>
              <h1 className="mt-7 max-w-2xl text-[2.8rem] font-semibold leading-[1.04] tracking-[-0.055em] text-slate-950 sm:text-6xl lg:text-[4.4rem]">
                See what’s
                <span className="block text-emerald-800">happening at</span>
                <span className="block">the polling unit.</span>
              </h1>
              <p className="mt-6 max-w-xl text-base leading-7 text-slate-600 sm:text-lg sm:leading-8">
                "Follow unofficial reports submitted by assigned monitors across all 23 local government areas."
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <a
                  href="#results"
                  className="group inline-flex min-h-12 items-center gap-2 rounded-lg bg-emerald-800 px-5 py-3 text-sm font-semibold text-white shadow-md shadow-emerald-950/10 transition duration-200 hover:-translate-y-0.5 hover:bg-emerald-900 active:translate-y-0"
                >
                  Explore the results <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
                </a>
                <Link
                  to="/login"
                  className="group inline-flex min-h-12 items-center gap-2 rounded-lg border border-slate-300 bg-white/70 px-5 py-3 text-sm font-semibold text-slate-800 transition duration-200 hover:-translate-y-0.5 hover:border-emerald-700/40 hover:bg-white active:translate-y-0"
                >
                  <LogIn size={18} aria-hidden="true" />
                  Monitor sign in
                  <ArrowRight
                    size={17}
                    aria-hidden="true"
                    className="transition-transform group-hover:translate-x-1"
                  />
                </Link>
              </div>
              <div className="mt-8 flex max-w-xl items-start gap-3 border-l-2 border-amber-500 pl-4 text-sm leading-6 text-slate-600">
                <ShieldCheck size={18} className="mt-0.5 shrink-0 text-amber-700" aria-hidden="true" />
                <p>
                  Unofficial — Agent-Submitted Data. Dumo Youth Network Election
                  Monitoring System does not
                  declare election winners; only authorized electoral bodies
                  do.
                </p>
              </div>
            </div>

            <div className="relative rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_24px_70px_-35px_rgba(15,23,42,0.24)] sm:p-7">
              <div className="relative flex items-start justify-between gap-4">
                <div>
                  <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-800">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50"><Activity size={14} aria-hidden="true" /></span>
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
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800 disabled:cursor-wait disabled:opacity-60"
                >
                  <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
                </button>
              </div>
              <div className="relative mt-6 grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-slate-200/80 bg-[#f8faf8] p-4 transition hover:border-emerald-200">
                  <p className="text-[11px] font-medium text-slate-500">
                    Reports received
                  </p>
                  <p className="mt-2 text-2xl font-bold tabular-nums tracking-tight text-slate-950 sm:text-3xl">
                    {displayOverview.election
                      ? formatNumber(displayOverview.submitted_polling_units)
                      : "—"}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200/80 bg-[#f8faf8] p-4 transition hover:border-emerald-200">
                  <p className="text-[11px] font-medium text-slate-500">
                    State coverage
                  </p>
                  <p className="mt-2 text-2xl font-bold tabular-nums tracking-tight text-slate-950 sm:text-3xl">
                    {displayOverview.submission_coverage_percent == null
                      ? "—"
                      : `${displayOverview.submission_coverage_percent.toFixed(1)}%`}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200/80 bg-[#f8faf8] p-4 transition hover:border-emerald-200">
                  <p className="text-[11px] font-medium text-slate-500">Reported votes</p>
                  <p className="mt-2 text-2xl font-bold tabular-nums tracking-tight text-slate-950 sm:text-3xl">
                    {hasUploadedResults ? formatNumber(totalVotes) : "—"}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200/80 bg-[#f8faf8] p-4 transition hover:border-emerald-200">
                  <p className="text-[11px] font-medium text-slate-500">Current statewide lead</p>
                  <p className="mt-2 truncate text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
                    {hasUploadedResults && leadingParty ? leadingParty.party : "—"}
                  </p>
                </div>
              </div>
              <p className="relative mt-5 flex items-center gap-2 border-t border-slate-200 pt-4 text-xs text-slate-500">
                <Clock3 size={14} /> Last update: {formatDate(displayOverview.last_updated)}
              </p>
            </div>
          </div>
          <div className="relative mx-auto mt-14 grid max-w-7xl grid-cols-1 gap-3 px-5 sm:grid-cols-3 lg:px-8">
            {[
              { label: "Geographic coverage", value: "23 local government areas", icon: MapPin },
              { label: "Reporting model", value: "Polling-unit submissions", icon: Radio },
              { label: "Public status", value: "Provisional & transparent", icon: ShieldCheck },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.label} className="flex items-center gap-3 rounded-xl border border-slate-200/80 bg-white/75 px-4 py-3 shadow-sm shadow-slate-900/[0.02]">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-800">
                    <Icon size={17} aria-hidden="true" />
                  </span>
                  <span>
                    <span className="block text-[10px] font-semibold uppercase tracking-[0.13em] text-slate-500">{item.label}</span>
                    <span className="mt-0.5 block text-sm font-semibold text-slate-800">{item.value}</span>
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        <section id="results" className="scroll-mt-24 bg-[#f5f7f6] py-16 sm:py-24">
          <div className="mx-auto max-w-7xl px-2 sm:px-5 lg:px-8">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-700">
                  Rivers State · LGA overview
                </p>
                <h2 className="mt-3 max-w-3xl text-4xl font-black tracking-[-0.035em] text-slate-950 sm:text-5xl">
                  See where submitted results currently lead.
                </h2>
              </div>
              <div className="flex max-w-xl items-start gap-3 rounded-2xl border border-emerald-200 bg-white p-4 text-base leading-7 text-slate-800 shadow-sm">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-800">
                  <Info size={18} aria-hidden="true" />
                </span>
                <p>
                  Map colors show the <strong>party currently leading</strong>{" "}from reports received in each LGA. Always check the{" "}<strong>reporting coverage percentage</strong> before interpreting the result.
                </p>
              </div>
            </div>

            {error && (
              <div role="alert" className="mt-8 rounded-2xl border border-red-200 bg-red-50 p-5 text-red-800">
                {error}
              </div>
            )}

            <div className="mt-8 -mx-1 rounded-2xl border border-slate-200/80 bg-white p-1 shadow-xl shadow-slate-900/[0.04] sm:mx-0 sm:mt-10 sm:rounded-[1.75rem] sm:p-5">
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
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: partyColor(party.party) }} />
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
                <p className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.2em] text-emerald-700"><BarChart3 size={15} /> Statewide totals</p>
                <h2 className="mt-4 text-4xl font-black leading-[1.08] tracking-[-0.045em] text-slate-950 sm:text-5xl">Reported vote position</h2>
                <p className="mt-5 max-w-md text-sm leading-7 text-slate-600">
                  Totals update as monitors submit polling-unit records. These figures remain provisional and unofficial.
                </p>
                <div className="mt-6 flex items-start gap-3 rounded-xl border border-emerald-100 bg-emerald-50/70 p-4 text-sm leading-6 text-emerald-950">
                  <Info size={17} className="mt-0.5 shrink-0 text-emerald-700" aria-hidden="true" />
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
                          <span className="h-3 w-3 shrink-0 rounded-full ring-4 ring-white" style={{ backgroundColor: partyColor(party.party) }} />
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
                <p className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.2em] text-emerald-800"><Radio size={14} /> Election updates</p>
                <h2 className="mt-3 text-4xl font-bold tracking-[-0.045em] text-slate-950 sm:text-5xl">Latest field reports</h2>
              </div>
              <p className="max-w-lg text-sm leading-6 text-slate-600">A privacy-safe stream of the newest polling-unit submissions. Agent identities are not published.</p>
            </div>
            <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {displayOverview.updates.slice(0, 9).map((update) => (
                <article key={update.id} className="group rounded-xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-900/[0.03] transition duration-200 hover:-translate-y-1 hover:border-emerald-300 hover:shadow-lg hover:shadow-emerald-950/[0.06]">
                  <div className="flex items-center justify-between gap-3 text-xs text-slate-500">
                    <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-bold text-emerald-800">{update.lga}</span>
                    <time>{formatDate(update.submitted_at)}</time>
                  </div>
                  <h3 className="mt-5 text-lg font-bold leading-snug text-slate-900">Result received from {update.polling_unit_name}</h3>
                  <p className="mt-2 text-sm text-slate-600">{update.ward} ward · {update.polling_unit_code}</p>
                  <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4">
                    <span className="text-xs text-slate-500">Reported leader</span>
                    <span className="flex items-center gap-2 font-bold text-slate-800">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: partyColor(update.leading_party?.party) }} />
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

        <section
          id="methodology"
          className="relative scroll-mt-20 overflow-hidden border-y border-emerald-100 bg-emerald-50 py-24"
        >
          <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-emerald-200/50 blur-3xl" />
          <div className="relative mx-auto max-w-7xl px-5 lg:px-8">
            <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.2em] text-emerald-800">How it works</p>
                <h2 className="mt-4 max-w-xl bg-gradient-to-r from-emerald-950 via-emerald-700 to-teal-600 bg-clip-text text-4xl font-black leading-tight tracking-[-0.035em] text-transparent sm:text-5xl">Transparent from field report to public view.</h2>
                <p className="mt-5 max-w-lg text-base font-medium leading-7 text-emerald-950">
                  Follow each result through a clear, structured process—from
                  an assigned monitor's submission to the public dashboard.
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
                    <div key={item.title} className="rounded-2xl border border-emerald-200 bg-white p-6 shadow-md shadow-emerald-950/5">
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700"><Icon size={21} /></div>
                      <h3 className="mt-5 font-black text-slate-950">{item.title}</h3>
                      <p className="mt-2 text-sm leading-6 text-slate-600">{item.text}</p>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="mt-14 flex flex-col gap-6 rounded-3xl bg-emerald-900 p-7 text-white sm:flex-row sm:items-center sm:justify-between sm:p-10">
              <div>
                <p className="text-sm font-bold text-emerald-100">Part of the monitoring network?</p>
                <h3 className="command-center-title mt-2 text-3xl font-black text-white">Sign in to your command center.</h3>
              </div>
              <Link
                to="/login"
                className="group inline-flex min-h-13 shrink-0 items-center justify-center gap-2 rounded-full bg-emerald-800 px-6 py-3.5 font-black text-white shadow-xl shadow-emerald-950/20 transition duration-200 hover:-translate-y-0.5 hover:bg-emerald-700 hover:shadow-emerald-950/30 active:translate-y-0"
              >
                <LogIn size={18} aria-hidden="true" />
                Monitor login
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

      <footer className="border-t border-slate-200 bg-white py-10">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-5 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between lg:px-8">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><Activity size={18} /></span>
            <div><strong className="block text-slate-900">Dumo Youth Network</strong><span>Election Monitoring System</span></div>
          </div>
          <p>Unofficial — Agent-Submitted Data</p>
          <a href="https://services3.arcgis.com/7J7WB6yJX0pYke9q/ArcGIS/rest/services/LGAs_Boundaries/FeatureServer" target="_blank" rel="noreferrer" className="hover:text-emerald-700">Map boundary source <ArrowRight size={13} className="inline" /></a>
        </div>
      </footer>
    </div>
  );
}
