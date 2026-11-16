import { useEffect, useState } from "react";

const API_URL = import.meta.env.DEV
  ? (import.meta.env.VITE_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "")
  : "";

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
};

export const defaultBranding: Branding = {
  organization_name: "Dumo Youth Network",
  logo_data_url: null,
  logo_title: "Dumo Youth Network",
  logo_subtitle: "Election Monitoring System",
  login_heading: "Welcome back.",
  login_description: "Enter your registered email or phone number to continue to your monitoring dashboard.",
  primary_color: "#047857",
  background_color: "#f6f8f7",
  text_color: "#0f172a",
  font_family: "Inter",
  font_size: 16,
  font_style: "normal",
  background_image_data_url: null,
  favicon_data_url: null,
};

let currentBranding = defaultBranding;
const BRANDING_EVENT = "dumo-branding-change";

export function applyBranding(value: Partial<Branding>) {
  currentBranding = { ...defaultBranding, ...value };
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
  favicon.href = currentBranding.favicon_data_url || currentBranding.logo_data_url || "/dyn-favicon-192.png";
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
