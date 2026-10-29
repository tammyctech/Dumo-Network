"""Published 2023 Rivers governorship LGA collation figures.

These are LGA-level aggregates, not polling-unit results. Seeders must retain
that provenance when adapting the data to the polling-unit-oriented schema.
"""

from dataclasses import dataclass


ELECTION_NAME = "[HISTORICAL DEMO] 2023 Rivers State Governorship Election"
ELECTION_DATE = "2023-03-18T08:00:00+01:00"
COLLATION_DATE = "2023-03-20T23:00:00+01:00"
SOURCE_URL = (
    "https://en.wikipedia.org/wiki/"
    "2023_Rivers_State_gubernatorial_election#By_local_government_area"
)


@dataclass(frozen=True)
class LgaResult:
    lga: str
    apc: int
    pdp: int
    sdp: int
    others: int

    @property
    def party_votes(self) -> dict[str, int]:
        return {
            "APC": self.apc,
            "PDP": self.pdp,
            "SDP": self.sdp,
            "OTHERS": self.others,
        }

    @property
    def valid_votes(self) -> int:
        return sum(self.party_votes.values())


LGA_RESULTS = (
    LgaResult("Abua/Odual", 5738, 9763, 463, 712),
    LgaResult("Ahoada East", 2650, 14408, 2077, 903),
    LgaResult("Ahoada West", 4883, 6425, 1063, 775),
    LgaResult("Akuku-Toru", 3724, 6273, 222, 931),
    LgaResult("Andoni", 3149, 8319, 1185, 618),
    LgaResult("Asari-Toru", 4209, 12663, 179, 1271),
    LgaResult("Bonny", 3285, 8032, 559, 1571),
    LgaResult("Degema", 3107, 4437, 579, 1006),
    LgaResult("Eleme", 2662, 8414, 2251, 920),
    LgaResult("Emohua", 5916, 20600, 805, 1270),
    LgaResult("Etche", 6408, 16043, 2586, 1283),
    LgaResult("Gokana", 7410, 17455, 13840, 755),
    LgaResult("Ikwerre", 7503, 13716, 1447, 1424),
    LgaResult("Khana", 620, 9475, 5846, 494),
    LgaResult("Obio/Akpor", 7361, 45065, 3056, 10083),
    LgaResult("Ogba/Egbema/Ndoni", 6811, 17729, 3450, 3391),
    LgaResult("Ogu/Bolo", 1524, 7103, 310, 528),
    LgaResult("Okrika", 2719, 10342, 822, 1719),
    LgaResult("Omuma", 2127, 8760, 804, 234),
    LgaResult("Opobo/Nkoro", 1246, 11538, 159, 246),
    LgaResult("Oyigbo", 2793, 9886, 796, 3086),
    LgaResult("Port Harcourt", 8954, 26892, 3974, 6689),
    LgaResult("Tai", 295, 9276, 508, 148),
)
