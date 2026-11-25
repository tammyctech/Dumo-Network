import { useEffect, useState } from "react";

const API_URL = import.meta.env.DEV
  ? (import.meta.env.VITE_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "")
  : "";

const DEFAULT_LOGO_URL = "/ems-mark.svg";

export type Branding = {
  organization_name: string;
  logo_data_url: string | null;
  logo_title: string;
  logo_subtitle: string;
  login_heading: string;
  login_description: string;
  primary_color: string;
  background_color: string;
  text_color: string;
  font_family: string;
  font_size: number;
  font_style: string;
  background_image_data_url: string | null;
  favicon_data_url: string | null;
  landing_text: Record<string, { text: string; color: string }>;
};

export const defaultLandingText: Record<string, { text: string; color: string }> = {
  nav_results:{text:"Live results",color:"#475569"}, nav_updates:{text:"Updates",color:"#475569"}, nav_methodology:{text:"Methodology",color:"#475569"}, nav_login:{text:"Monitor login",color:"#ffffff"},
  hero_line_1:{text:"See what’s",color:"#0f172a"}, hero_line_2:{text:"happening at",color:"#0369a1"}, hero_line_3:{text:"the polling unit.",color:"#0f172a"}, hero_description:{text:"Follow unofficial reports submitted by assigned monitors across all 23 local government areas.",color:"#475569"}, hero_results_button:{text:"Explore the results",color:"#ffffff"}, hero_login_button:{text:"Monitor sign in",color:"#1e293b"}, hero_disclaimer:{text:"Unofficial — Agent-Submitted Data. Dumo Youth Network Election Monitoring System does not declare election winners; only authorized electoral bodies do.",color:"#475569"},
  map_eyebrow:{text:"Rivers State · LGA overview",color:"#0284c7"}, map_heading:{text:"See where submitted results currently lead.",color:"#0f172a"}, map_description:{text:"Map colors show the party currently leading from reports received in each LGA. Always check the reporting coverage percentage before interpreting the result.",color:"#1e293b"},
  totals_eyebrow:{text:"Statewide totals",color:"#0284c7"}, totals_heading:{text:"Reported vote position",color:"#0f172a"}, totals_description:{text:"Totals update as monitors submit polling-unit records. These figures remain provisional and unofficial.",color:"#475569"},
  updates_eyebrow:{text:"Election updates",color:"#0369a1"}, updates_heading:{text:"Latest field reports",color:"#0f172a"}, updates_description:{text:"A privacy-safe stream of the newest polling-unit submissions. Agent identities are not published.",color:"#475569"},
  method_eyebrow:{text:"How it works",color:"#0369a1"}, method_heading:{text:"Transparent from field report to public view.",color:"#0c4a6e"}, method_description:{text:"Follow each result through a clear, structured process—from an assigned monitor's submission to the public dashboard.",color:"#0c4a6e"},
  cta_label:{text:"Part of the monitoring network?",color:"#e0f2fe"}, cta_heading:{text:"Sign in to your command center.",color:"#ffffff"}, cta_button:{text:"Open monitoring workspace",color:"#ffffff"}, footer_notice:{text:"Unofficial — Agent-Submitted Data",color:"#64748b"},
};

export const defaultBranding: Branding = {
  organization_name: "Dumo Youth Network",
  logo_data_url: DEFAULT_LOGO_URL,
  logo_title: "Dumo Youth Network",
  logo_subtitle: "Election Monitoring System",
  login_heading: "Welcome back.",
  login_description: "Enter your registered email or phone number to continue to your monitoring dashboard.",
  primary_color: "#0284c7",
  background_color: "#f6f8f7",
  text_color: "#0f172a",
  font_family: "Inter",
  font_size: 16,
  font_style: "normal",
  background_image_data_url: null,
  favicon_data_url: null,
  landing_text: defaultLandingText,
};

let currentBranding = defaultBranding;
const BRANDING_EVENT = "dumo-branding-change";

export function applyBranding(value: Partial<Branding>) {
  currentBranding = {
    ...defaultBranding,
    ...value,
    logo_data_url: value.logo_data_url || DEFAULT_LOGO_URL,
    landing_text: { ...defaultLandingText, ...(value.landing_text || {}) },
  };
  const root = document.documentElement;
  root.dataset.customBrand = "true";
  root.style.setProperty("--brand-primary", currentBranding.primary_color);
  root.style.setProperty("--brand-background", currentBranding.background_color);
  root.style.setProperty("--brand-text", currentBranding.text_color);
  root.style.setProperty("--brand-font-size", `${currentBranding.font_size}px`);
  root.style.setProperty("--brand-font-family", `"${currentBranding.font_family}", sans-serif`);
  root.style.setProperty("--brand-font-style", currentBranding.font_style);
  root.style.setProperty("--brand-background-image", currentBranding.background_image_data_url ? `url("${currentBranding.background_image_data_url}")` : "none");
  document.title = currentBranding.logo_title || currentBranding.organization_name;

  let favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!favicon) {
    favicon = document.createElement("link");
    favicon.rel = "icon";
    document.head.appendChild(favicon);
  }
  favicon.href = currentBranding.favicon_data_url || currentBranding.logo_data_url || DEFAULT_LOGO_URL;
  window.dispatchEvent(new CustomEvent(BRANDING_EVENT, { detail: currentBranding }));
  return currentBranding;
}

export async function loadBranding() {
  try {
    const response = await fetch(`${API_URL}/api/admin/organization/branding`);
    if (response.ok) applyBranding(await response.json());
  } catch {
    applyBranding(defaultBranding);
  }
}

export function useBranding() {
  const [branding, setBranding] = useState(currentBranding);
  useEffect(() => {
    const update = (event: Event) => setBranding((event as CustomEvent<Branding>).detail);
    window.addEventListener(BRANDING_EVENT, update);
    return () => window.removeEventListener(BRANDING_EVENT, update);
  }, []);
  return branding;
}
