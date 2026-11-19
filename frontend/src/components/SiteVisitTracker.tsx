import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const API = import.meta.env.DEV
  ? (import.meta.env.VITE_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "")
  : "";
const PUBLIC_PATHS = new Set(["/", "/login", "/activate-agent", "/forgot-password", "/reset-password"]);

function visitorId() {
  const key = "dyn_anonymous_visitor";
  try {
    const existing = localStorage.getItem(key);
    if (existing) return existing;
    const created = crypto.randomUUID();
    localStorage.setItem(key, created);
    return created;
  } catch {
    return crypto.randomUUID();
  }
}

export default function SiteVisitTracker() {
  const location = useLocation();

  useEffect(() => {
    const isApplicationForm = location.pathname.startsWith("/apply/agent/");
    if (!PUBLIC_PATHS.has(location.pathname) && !isApplicationForm) return;
    if (navigator.doNotTrack === "1") return;

    void fetch(`${API}/api/site-analytics/visit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        visitor_id: visitorId(),
        path: location.pathname,
        referrer: document.referrer || null,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || null,
      }),
      keepalive: true,
    }).catch(() => undefined);
  }, [location.pathname]);

  return null;
}
