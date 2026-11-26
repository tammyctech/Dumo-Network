import { Activity, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import type { Branding } from "../context/branding";

const mapSource = "https://github.com/wmgeolab/geoBoundaries";

export default function LandingFooter({ branding }: { branding: Branding }) {
  const logo = branding.logo_data_url ? (
    <img src={branding.logo_data_url} alt={`${branding.logo_title} logo`} className="h-11 w-11 rounded-xl bg-white object-contain p-1" />
  ) : (
    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 text-white"><Activity size={20} /></span>
  );

  return (
    <footer className="landing-footer">
      <div className="mx-auto max-w-7xl px-5 lg:px-8">
        <div className="landing-footer-grid">
          <div className="landing-footer-brand">
            <div className="flex items-center gap-3">
              {logo}
              <div className="min-w-0">
                <strong className="block">{branding.logo_title === "Dumo Youth Network" ? "Dumo Network" : branding.logo_title}</strong>
                <span>{branding.organization_name}</span>
              </div>
            </div>
            <p className="mt-4">Rivers State’s election monitoring platform for real-time reporting, coverage tracking and unofficial results from all 23 LGAs.</p>
          </div>
          <nav aria-labelledby="footer-platform">
            <h2 id="footer-platform">Platform</h2>
            <ul>
              <li><Link to="/live-results">Live Results</Link></li>
              <li><a href="/#results">Coverage map</a></li>
              <li><a href="/#updates">Field reports</a></li>
            </ul>
          </nav>
          <nav aria-labelledby="footer-resources">
            <h2 id="footer-resources">Resources</h2>
            <ul>
              <li><a href="/#methodology">How It Works</a></li>
              <li><a href={mapSource} target="_blank" rel="noreferrer">Map boundary source</a></li>
            </ul>
          </nav>
          <nav aria-labelledby="footer-involved">
            <h2 id="footer-involved">Get Involved</h2>
            <ul>
              <li><Link to="/activate-agent">Activate agent account</Link></li>
              <li><a href="/#report-incident">Report an Incident</a></li>
            </ul>
          </nav>
          <div className="landing-footer-notice">
            <h2 className="flex items-center gap-2"><ShieldCheck size={17} aria-hidden="true" /> About the results</h2>
            <p>Figures remain unofficial until declared by the authorized electoral body.</p>
          </div>
        </div>
        <div className="landing-footer-bottom">© {new Date().getFullYear()} Dumo Network. All Rights Reserved.</div>
      </div>
    </footer>
  );
}
