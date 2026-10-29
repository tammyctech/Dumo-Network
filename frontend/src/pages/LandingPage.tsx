import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  ArrowRight,
  BarChart3,
  ChevronRight,
  Clock3,
  Database,
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
  let hash = 0;
  for (const character of party.toUpperCase()) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }
  return PARTY_COLORS[hash % PARTY_COLORS.length];
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
}: {
  geoJson: GeoJson | null;
  lgaResults: LgaResult[];
  mapLoading: boolean;
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
    const width = 720;
    const height = 500;
    const padding = 20;
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
    : lgaResults.find((item) => item.leader) || lgaResults[0] || null;
  const activeName = selected || selectedResult?.lga || null;
  const leaderParties = Array.from(
    new Set(
      lgaResults
        .map((item) => item.leader?.party)
        .filter((party): party is string => Boolean(party))
    )
  );

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(260px,0.55fr)]">
      <div className="relative min-h-[420px] overflow-hidden rounded-3xl border border-white/10 bg-[#071c19] p-4 sm:p-6">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(16,185,129,0.13),transparent_55%)]" />
        {geoJson && projection ? (
          <svg
            viewBox={`0 0 ${projection.width} ${projection.height}`}
            role="img"
            aria-label="Rivers State election leaders by local government area"
            className="relative h-full min-h-[390px] w-full drop-shadow-2xl"
          >
            {geoJson.features.map((feature) => {
              const name = feature.properties.ADM2_EN || "Unknown LGA";
              const result = results.get(normalizeLga(name));
              const active =
                activeName != null &&
                normalizeLga(activeName) === normalizeLga(name);
              return (
                <path
                  key={name}
                  d={featurePath(feature)}
                  fill={partyColor(result?.leader?.party)}
                  fillOpacity={result?.leader ? 0.9 : 0.32}
                  stroke={active ? "#ffffff" : "#d1fae5"}
                  strokeWidth={active ? 3 : 1.15}
                  className="cursor-pointer transition hover:brightness-125"
                  onMouseEnter={() => setSelected(name)}
                  onFocus={() => setSelected(name)}
                  onClick={() => setSelected(name)}
                  tabIndex={0}
                  aria-label={`${name}: ${result?.leader?.party || "no result yet"}`}
                >
                  <title>
                    {name}: {result?.leader?.party || "No party totals yet"}
                    {result?.coverage_percent != null
                      ? `, ${result.coverage_percent.toFixed(1)}% reporting coverage`
                      : ""}
                  </title>
                </path>
              );
            })}
          </svg>
        ) : mapLoading ? (
          <div className="flex min-h-[390px] items-center justify-center text-emerald-100/70">
            <RefreshCw size={24} className="mr-3 animate-spin" />
            Loading Rivers State map…
          </div>
        ) : (
          <div className="flex min-h-[390px] flex-col items-center justify-center px-6 text-center text-emerald-100/70">
            <MapIcon size={30} />
            <p className="mt-3 font-semibold text-white">
              Map boundaries are temporarily unavailable
            </p>
            <p className="mt-1 max-w-sm text-sm">
              Statewide totals and election updates remain available below.
            </p>
          </div>
        )}
        <div className="relative mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-white/10 pt-4 text-xs text-slate-300">
          <span className="font-bold uppercase tracking-wider text-slate-400">
            Map key
          </span>
          {leaderParties.slice(0, 7).map((party) => (
            <span key={party} className="flex items-center gap-1.5">
              <span
                className="h-2.5 w-2.5 rounded-sm"
                style={{ backgroundColor: partyColor(party) }}
              />
              {party}
            </span>
          ))}
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-slate-400/40" />
            No totals
          </span>
        </div>
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
            <div className="mt-5 rounded-2xl bg-slate-950 p-5 text-white">
              <p className="text-xs uppercase tracking-widest text-slate-400">
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
                <span className="text-2xl font-black">
                  {selectedResult.leader?.party || "No report"}
                </span>
              </div>
              <p className="mt-2 text-sm text-slate-300">
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
  const [error, setError] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setMapLoading(true);
      setError("");
      try {
        const mapRequest = fetch(RIVERS_GEOJSON_URL, {
          signal: controller.signal,
        }).catch(() => null);
        const overviewResponse = await fetch(
          `${API_URL}/api/public/election-overview`,
          { signal: controller.signal }
        );
        if (!overviewResponse.ok) {
          throw new Error("Live election data is temporarily unavailable.");
        }
        const overviewData = (await overviewResponse.json()) as PublicOverview;
        setOverview(overviewData);
        const mapResponse = await mapRequest;
        if (mapResponse?.ok) {
          setGeoJson((await mapResponse.json()) as GeoJson);
        }
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

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setRefreshKey((value) => value + 1);
    }, 60_000);

    return () => window.clearInterval(intervalId);
  }, []);

  const leadingParty = overview?.party_totals[0] || null;
  const totalVotes =
    overview?.party_totals.reduce((sum, party) => sum + party.votes, 0) || 0;

  return (
    <div className="min-h-screen bg-[#f5f7f6] text-slate-950">
      <a
        href="#main-content"
        className="fixed left-4 top-4 z-[100] -translate-y-24 rounded-lg bg-white px-4 py-2 font-bold text-slate-950 shadow-xl transition focus:translate-y-0"
      >
        Skip to main content
      </a>
      <header className="sticky inset-x-0 top-0 z-40 border-b border-white/10 bg-[#041713]/95 backdrop-blur-xl">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-5 lg:px-8">
          <Link to="/" className="flex items-center gap-3 text-white">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500 shadow-lg shadow-emerald-950/30">
              <Activity size={20} />
            </span>
            <span>
              <span className="block text-sm font-black tracking-wide">
                DUMO NETWORK
              </span>
              <span className="block text-[10px] uppercase tracking-[0.18em] text-emerald-300">
                Election Intelligence
              </span>
            </span>
          </Link>

          <nav className="hidden items-center gap-8 md:flex">
            <a href="#results" className="text-sm font-semibold text-slate-200 hover:text-white">
              Live results
            </a>
            <a href="#updates" className="text-sm font-semibold text-slate-200 hover:text-white">
              Updates
            </a>
            <a href="#methodology" className="text-sm font-semibold text-slate-200 hover:text-white">
              Methodology
            </a>
            <Link
              to="/login"
              className="rounded-full bg-white px-5 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-emerald-50"
            >
              Monitor login
            </Link>
          </nav>

          <button
            type="button"
            aria-label="Toggle navigation"
            onClick={() => setMobileMenuOpen((value) => !value)}
            className="rounded-xl border border-white/20 p-2.5 text-white md:hidden"
          >
            {mobileMenuOpen ? <X /> : <Menu />}
          </button>
        </div>
        {mobileMenuOpen && (
          <nav className="border-t border-white/10 bg-slate-950 px-5 py-5 md:hidden">
            <div className="flex flex-col gap-4 text-sm font-semibold text-white">
              <a href="#results" onClick={() => setMobileMenuOpen(false)}>Live results</a>
              <a href="#updates" onClick={() => setMobileMenuOpen(false)}>Updates</a>
              <a href="#methodology" onClick={() => setMobileMenuOpen(false)}>Methodology</a>
              <Link to="/login">Monitor login</Link>
            </div>
          </nav>
        )}
      </header>

      <main id="main-content">
        <section className="relative overflow-hidden bg-[#041713] pb-24 pt-20 text-white sm:pb-28 sm:pt-28">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_20%,rgba(16,185,129,0.22),transparent_34%),radial-gradient(circle_at_12%_70%,rgba(14,116,144,0.16),transparent_30%)]" />
          <div className="absolute inset-0 opacity-[0.045] [background-image:linear-gradient(rgba(255,255,255,.8)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.8)_1px,transparent_1px)] [background-size:48px_48px]" />
          <div className="relative mx-auto grid max-w-7xl gap-14 px-5 lg:grid-cols-[1.15fr_0.85fr] lg:items-center lg:px-8">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.16em] text-emerald-300">
                <Radio size={14} className="animate-pulse" />
                Live public results monitor
              </div>
              <h1 className="mt-7 max-w-3xl text-5xl font-black leading-[1.04] tracking-[-0.04em] sm:text-6xl lg:text-7xl">
                Rivers State election monitoring,
                <span className="block text-emerald-400">in one clear view.</span>
              </h1>
              <p className="mt-7 max-w-2xl text-lg leading-8 text-slate-300">
                Track reporting coverage, leading parties, and the latest
                polling-unit submissions across all 23 local government areas.
              </p>
              <div className="mt-9 flex flex-wrap gap-4">
                <a
                  href="#results"
                  className="inline-flex items-center gap-2 rounded-full bg-emerald-500 px-6 py-3.5 font-bold text-slate-950 transition hover:bg-emerald-400"
                >
                  View live results <ArrowRight size={18} />
                </a>
                <Link
                  to="/login"
                  className="inline-flex items-center gap-2 rounded-full border border-white/20 px-6 py-3.5 font-bold text-white transition hover:bg-white/10"
                >
                  Monitor sign in
                </Link>
              </div>
              <div className="mt-10 flex items-start gap-3 border-l-2 border-amber-400 pl-4 text-sm text-slate-300">
                <ShieldCheck size={18} className="mt-0.5 shrink-0 text-amber-300" />
                <p>
                  Unofficial, agent-submitted data. A lead shown here is not a
                  declared result; only the authorized electoral body can declare
                  a winner.
                </p>
              </div>
            </div>

            <div className="rounded-[2rem] border border-white/10 bg-white/[0.07] p-5 shadow-2xl backdrop-blur-xl sm:p-7">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-300">
                    Reporting now
                  </p>
                  <h2 className="mt-2 text-xl font-bold">
                    {overview?.election?.name || "Awaiting active election"}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setRefreshKey((value) => value + 1)}
                  aria-label="Refresh live data"
                  className="rounded-xl border border-white/10 p-3 text-slate-300 hover:bg-white/10"
                >
                  <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
                </button>
              </div>
              <div className="mt-7 grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-black/20 p-4">
                  <p className="text-xs text-slate-400">Reports received</p>
                  <p className="mt-2 text-3xl font-black">
                    {formatNumber(overview?.submitted_polling_units)}
                  </p>
                </div>
                <div className="rounded-2xl bg-black/20 p-4">
                  <p className="text-xs text-slate-400">State coverage</p>
                  <p className="mt-2 text-3xl font-black">
                    {overview?.submission_coverage_percent?.toFixed(1) || "0.0"}%
                  </p>
                </div>
                <div className="rounded-2xl bg-black/20 p-4">
                  <p className="text-xs text-slate-400">Reported votes</p>
                  <p className="mt-2 text-3xl font-black">{formatNumber(totalVotes)}</p>
                </div>
                <div className="rounded-2xl bg-black/20 p-4">
                  <p className="text-xs text-slate-400">Reported statewide lead</p>
                  <p className="mt-2 truncate text-3xl font-black">
                    {leadingParty?.party || "—"}
                  </p>
                </div>
              </div>
              <p className="mt-5 flex items-center gap-2 text-xs text-slate-400">
                <Clock3 size={14} /> Last report: {formatDate(overview?.last_updated)}
                <span className="text-slate-600">•</span>
                Auto-refreshes every 60 seconds
              </p>
            </div>
          </div>
        </section>

        <section aria-label="Data status" className="border-b border-slate-200 bg-white">
          <div className="mx-auto grid max-w-7xl divide-y divide-slate-200 px-5 sm:grid-cols-3 sm:divide-x sm:divide-y-0 lg:px-8">
            {[
              ["Data classification", "Unofficial · Agent-submitted"],
              ["Geographic scope", "23 Rivers State LGAs"],
              ["Reporting basis", "Received polling-unit submissions"],
            ].map(([label, value]) => (
              <div key={label} className="py-4 sm:px-6 sm:first:pl-0">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  {label}
                </p>
                <p className="mt-1 text-sm font-bold text-slate-800">{value}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="results" className="scroll-mt-6 py-24">
          <div className="mx-auto max-w-7xl px-5 lg:px-8">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-700">
                  Live LGA picture
                </p>
                <h2 className="mt-3 max-w-3xl text-4xl font-black tracking-[-0.035em] text-slate-950 sm:text-5xl">
                  See where submitted results currently lead.
                </h2>
              </div>
              <p className="max-w-xl text-sm leading-6 text-slate-600">
                Each color identifies the party currently leading in received
                reports. Always compare the lead with reporting coverage.
              </p>
            </div>

            {error && (
              <div role="alert" className="mt-8 rounded-2xl border border-red-200 bg-red-50 p-5 text-red-800">
                {error}
              </div>
            )}

            <div className="mt-10">
              <MapPanel
                geoJson={geoJson}
                lgaResults={overview?.lga_results || []}
                mapLoading={mapLoading}
              />
            </div>

            <div className="mt-8 flex flex-wrap gap-3">
              {overview?.party_totals.slice(0, 8).map((party) => (
                <div key={party.party} className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm shadow-sm">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: partyColor(party.party) }} />
                  <strong>{party.party}</strong>
                  <span className="text-slate-500">{formatNumber(party.votes)}</span>
                </div>
              ))}
            </div>

            <div className="mt-10 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-col gap-2 border-b border-slate-200 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <div>
                  <h3 className="font-black text-slate-950">LGA reporting status</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    A text-based view of every map result for accessible comparison.
                  </p>
                </div>
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  {overview?.lga_results.length || 0} LGAs
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                    <tr>
                      <th scope="col" className="px-6 py-4">LGA</th>
                      <th scope="col" className="px-6 py-4">Reported lead</th>
                      <th scope="col" className="px-6 py-4 text-right">Votes</th>
                      <th scope="col" className="px-6 py-4 text-right">Units reporting</th>
                      <th scope="col" className="px-6 py-4 text-right">Coverage</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(overview?.lga_results || []).map((item) => (
                      <tr key={item.lga} className="hover:bg-slate-50/80">
                        <th scope="row" className="px-6 py-4 font-bold text-slate-900">{item.lga}</th>
                        <td className="px-6 py-4">
                          <span className="inline-flex items-center gap-2 font-semibold text-slate-700">
                            <span
                              className="h-2.5 w-2.5 rounded-sm"
                              style={{ backgroundColor: partyColor(item.leader?.party) }}
                            />
                            {item.leader?.party || "No totals"}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right font-semibold text-slate-700">
                          {formatNumber(item.leader?.votes)}
                        </td>
                        <td className="px-6 py-4 text-right text-slate-600">
                          {item.submitted_polling_units} / {item.total_polling_units}
                        </td>
                        <td className="px-6 py-4 text-right font-bold text-slate-900">
                          {item.coverage_percent?.toFixed(1) || "0.0"}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>

        <section className="bg-white py-24">
          <div className="mx-auto max-w-7xl px-5 lg:px-8">
            <div className="grid gap-12 lg:grid-cols-[0.75fr_1.25fr]">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-700">Statewide totals</p>
                <h2 className="mt-3 text-4xl font-black tracking-[-0.035em] text-slate-950">Reported vote position</h2>
                <p className="mt-5 text-sm leading-7 text-slate-600">
                  Totals update as verified monitors submit polling-unit records.
                  These figures remain provisional and unofficial.
                </p>
              </div>
              <div className="space-y-5">
                {(overview?.party_totals || []).slice(0, 7).map((party, index) => {
                  const maximum = overview?.party_totals[0]?.votes || 1;
                  return (
                    <div key={party.party}>
                      <div className="mb-2 flex items-end justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-black text-slate-400">{String(index + 1).padStart(2, "0")}</span>
                          <span className="font-black text-slate-900">{party.party}</span>
                        </div>
                        <span className="font-black text-slate-950">{formatNumber(party.votes)}</span>
                      </div>
                      <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full" style={{ width: `${(party.votes / maximum) * 100}%`, backgroundColor: partyColor(party.party) }} />
                      </div>
                    </div>
                  );
                })}
                {!overview?.party_totals.length && (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-slate-500">Party totals will appear after the first result submission.</div>
                )}
              </div>
            </div>
          </div>
        </section>

        <section id="updates" className="scroll-mt-8 bg-slate-950 py-24 text-white">
          <div className="mx-auto max-w-7xl px-5 lg:px-8">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-emerald-400"><Radio size={14} /> Election updates</p>
                <h2 className="mt-3 text-4xl font-black tracking-[-0.035em]">Latest field reports</h2>
              </div>
              <p className="max-w-lg text-sm leading-6 text-slate-400">A privacy-safe stream of the newest polling-unit submissions. Agent identities are not published.</p>
            </div>
            <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {(overview?.updates || []).slice(0, 9).map((update) => (
                <article key={update.id} className="group rounded-2xl border border-white/10 bg-white/[0.05] p-5 transition hover:-translate-y-1 hover:border-emerald-400/40 hover:bg-white/[0.08]">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span className="rounded-full bg-emerald-400/10 px-2.5 py-1 font-bold text-emerald-300">{update.lga}</span>
                    <time>{formatDate(update.submitted_at)}</time>
                  </div>
                  <h3 className="mt-5 text-lg font-bold">Result received from {update.polling_unit_name}</h3>
                  <p className="mt-2 text-sm text-slate-400">{update.ward} ward · {update.polling_unit_code}</p>
                  <div className="mt-5 flex items-center justify-between border-t border-white/10 pt-4">
                    <span className="text-xs text-slate-400">Reported leader</span>
                    <span className="flex items-center gap-2 font-black">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: partyColor(update.leading_party?.party) }} />
                      {update.leading_party?.party || "Pending totals"}
                    </span>
                  </div>
                </article>
              ))}
              {!loading && !overview?.updates.length && (
                <div className="rounded-2xl border border-dashed border-white/20 bg-white/[0.04] p-8 text-center md:col-span-2 xl:col-span-3">
                  <Radio className="mx-auto text-emerald-400" />
                  <h3 className="mt-4 font-bold text-white">Awaiting field reports</h3>
                  <p className="mt-2 text-sm text-slate-400">
                    New polling-unit submissions will appear here as they are received.
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>

        <section id="methodology" className="scroll-mt-8 py-24">
          <div className="mx-auto max-w-7xl px-5 lg:px-8">
            <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-700">How it works</p>
                <h2 className="mt-3 text-4xl font-black tracking-[-0.035em] text-slate-950">Transparent from field report to public view.</h2>
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
                    <div key={item.title} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700"><Icon size={21} /></div>
                      <h3 className="mt-5 font-black text-slate-950">{item.title}</h3>
                      <p className="mt-2 text-sm leading-6 text-slate-600">{item.text}</p>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="mt-14 flex flex-col gap-6 rounded-3xl bg-emerald-600 p-7 text-white sm:flex-row sm:items-center sm:justify-between sm:p-10">
              <div>
                <p className="text-sm font-bold text-emerald-100">Part of the monitoring network?</p>
                <h3 className="mt-2 text-3xl font-black">Sign in to your command center.</h3>
              </div>
              <Link to="/login" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-white px-6 py-3.5 font-black text-emerald-800">Monitor login <ChevronRight size={18} /></Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white py-10">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-5 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between lg:px-8">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-950 text-emerald-400"><Activity size={18} /></span>
            <div><strong className="block text-slate-900">Dumo Network</strong><span>Election Monitoring Platform</span></div>
          </div>
          <p>Unofficial — Agent-Submitted Data</p>
          <a href="https://services3.arcgis.com/7J7WB6yJX0pYke9q/ArcGIS/rest/services/LGAs_Boundaries/FeatureServer" target="_blank" rel="noreferrer" className="hover:text-emerald-700">Map boundary source <ArrowRight size={13} className="inline" /></a>
        </div>
      </footer>
    </div>
  );
}
