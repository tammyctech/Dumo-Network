export const PARTY_COLORS: Record<string, string> = {
  A: "#92400E",
  AA: "#A21CAF",
  AAC: "#0E7490",
  ADC: "#2563EB",
  ADP: "#C2410C",
  APC: "#7C3AED",
  APGA: "#0F766E",
  APM: "#B45309",
  APP: "#4338CA",
  BP: "#BE123C",
  DLA: "#0369A1",
  LP: "#4D7C0F",
  NDP: "#7E22CE",
  NDC: "#15803D",
  NNPP: "#B91C1C",
  NRM: "#047857",
  PDP: "#DC2626",
  PRP: "#9F1239",
  SDP: "#1D4ED8",
  YP: "#A16207",
  YPP: "#C026D3",
  ZLP: "#334155",
};

export function partyColor(party: string | null | undefined): string {
  if (!party) return "#cbd5e1";
  return PARTY_COLORS[party.trim().toUpperCase()] || "#64748b";
}
