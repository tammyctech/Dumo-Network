import { useState } from "react";

// Official emblems published in INEC's current statutory register:
// https://inecnigeria.org/parties
const INEC_ASSET = "https://inecnigeria.org/_nuxt/";

export const partyLogoUrls: Record<string, string> = {
  AA: `${INEC_ASSET}action-alliance-aa_logo.DQolkzM6.jpg`,
  AAC: `${INEC_ASSET}african-action-congress-aac_logo.BiPR0ZxO.jpg`,
  ADC: `${INEC_ASSET}african-democratic-congress-adc_logo.DBilnanA.jpg`,
  ADP: `${INEC_ASSET}action-democratic-party-adp_logo.7qxyEaV2.png`,
  APC: `${INEC_ASSET}all-progressives-congress-apc_logo.CSXCWB6p.jpg`,
  APGA: `${INEC_ASSET}all-progressives-grand-alliance-apga_logo.PfgYjSjV.jpg`,
  APM: `${INEC_ASSET}allied-peoples-movement-apm_logo.BQN54Bkl.jpg`,
  APP: `${INEC_ASSET}action-peoples-party-app_logo.BhRwRU7M.png`,
  BP: `${INEC_ASSET}boot-party-bp_logo.Br5O5Wf6.jpg`,
  DLA: `${INEC_ASSET}democratic-leadership-alliance-dla_logo.B-mFJlad.jpg`,
  LP: `${INEC_ASSET}labour-party-lp_logo.SV1XCjLU.jpg`,
  NDP: `${INEC_ASSET}national-democratic-party_logo.B2wV2anp.jpg`,
  NDC: `${INEC_ASSET}nigeria-democratic-congress_logo.BRx6oQl5.jpeg`,
  NNPP: `${INEC_ASSET}new-nigeria-peoples-party-nnpp_logo.DkfmFai5.jpg`,
  NRM: `${INEC_ASSET}national-rescue-movement-nrm_logo.BUg-M2QT.png`,
  PDP: `${INEC_ASSET}peoples-democratic-party-pdp_logo.D7bjcnnk.png`,
  PRP: `${INEC_ASSET}peoples-redemption-party-prp_logo.C8_o4OQI.png`,
  SDP: `${INEC_ASSET}social-democratic-party-sdp_logo.DhlQ2VXw.png`,
  YP: `${INEC_ASSET}youth-party-yp_logo.CLRm4uyn.png`,
  YPP: `${INEC_ASSET}young-progressive-party-ypp_logo.Biw28-Pp.jpeg`,
  ZLP: `${INEC_ASSET}zenith-labour-party-zlp_logo.B_S46I7c.jpg`,
};

export function PartyLogo({ party, name, className = "h-12 w-12" }: { party: string | null | undefined; name?: string; className?: string }) {
  const acronym = party?.trim().toUpperCase() || "?";
  const [failed, setFailed] = useState(false);
  const url = partyLogoUrls[acronym];
  if (!url || failed) {
    return <span aria-label={`${name || acronym} logo unavailable`} className={`grid shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-xs font-black text-slate-600 ${className}`}>{acronym}</span>;
  }
  return <img src={url} alt={`${name || acronym} logo`} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} className={`shrink-0 rounded-xl border border-slate-200 bg-white object-contain p-1 ${className}`} />;
}
