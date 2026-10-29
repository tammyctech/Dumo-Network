const LGA_RESULTS = [
  ["Abua/Odual", 5738, 9763, 463, 712],
  ["Ahoada East", 2650, 14408, 2077, 903],
  ["Ahoada West", 4883, 6425, 1063, 775],
  ["Akuku-Toru", 3724, 6273, 222, 931],
  ["Andoni", 3149, 8319, 1185, 618],
  ["Asari-Toru", 4209, 12663, 179, 1271],
  ["Bonny", 3285, 8032, 559, 1571],
  ["Degema", 3107, 4437, 579, 1006],
  ["Eleme", 2662, 8414, 2251, 920],
  ["Emohua", 5916, 20600, 805, 1270],
  ["Etche", 6408, 16043, 2586, 1283],
  ["Gokana", 7410, 17455, 13840, 755],
  ["Ikwerre", 7503, 13716, 1447, 1424],
  ["Khana", 620, 9475, 5846, 494],
  ["Obio/Akpor", 7361, 45065, 3056, 10083],
  ["Ogba/Egbema/Ndoni", 6811, 17729, 3450, 3391],
  ["Ogu/Bolo", 1524, 7103, 310, 528],
  ["Okrika", 2719, 10342, 822, 1719],
  ["Omuma", 2127, 8760, 804, 234],
  ["Opobo/Nkoro", 1246, 11538, 159, 246],
  ["Oyigbo", 2793, 9886, 796, 3086],
  ["Port Harcourt", 8954, 26892, 3974, 6689],
  ["Tai", 295, 9276, 508, 148],
] as const;

const PARTY_NAMES = ["APC", "PDP", "SDP", "OTHERS"] as const;

const lgaResults = LGA_RESULTS.map(([lga, ...votes]) => {
  const partyTotals = PARTY_NAMES.map((party, index) => ({
    party,
    votes: votes[index],
  })).sort((a, b) => b.votes - a.votes);

  return {
    lga,
    total_polling_units: 1,
    submitted_polling_units: 1,
    coverage_percent: 100,
    leader: partyTotals[0],
    party_totals: partyTotals,
  };
});

const partyTotals = PARTY_NAMES.map((party, index) => ({
  party,
  votes: LGA_RESULTS.reduce((sum, row) => sum + Number(row[index + 1]), 0),
})).sort((a, b) => b.votes - a.votes);

export const RIVERS_2023_DEMO = {
  state: "Rivers",
  data_type: "historical_lga_collation_demo",
  is_demo: true,
  source_label: "Published 2023 Rivers governorship LGA collation results",
  source_url:
    "https://en.wikipedia.org/wiki/2023_Rivers_State_gubernatorial_election#By_local_government_area",
  election: {
    id: -2023,
    name: "2023 Rivers State Governorship Election — Historical Demo",
    election_date: "2023-03-18T08:00:00+01:00",
  },
  last_updated: "2023-03-20T23:00:00+01:00",
  total_polling_units: 23,
  submitted_polling_units: 23,
  submission_coverage_percent: 100,
  party_totals: partyTotals,
  lga_results: lgaResults,
  updates: lgaResults
    .slice()
    .reverse()
    .slice(0, 12)
    .map((result, index) => ({
      id: -202300 - index,
      submitted_at: new Date(
        new Date("2023-03-20T23:00:00+01:00").getTime() - index * 12 * 60_000
      ).toISOString(),
      lga: result.lga,
      ward: "LGA collation",
      polling_unit_name: `${result.lga} LGA collation result`,
      polling_unit_code: "HISTORICAL-2023",
      leading_party: result.leader,
      is_flagged: false,
    })),
} as const;
