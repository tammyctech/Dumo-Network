# Rivers State electoral and agent audit — 2026-11-18

This report was generated using read-only queries against the configured Render PostgreSQL database. No production records were changed.

## Summary

- Migration: `7d3a5b1c9f20` (repository head)
- LGAs present: 23 of 23
- Wards: 319
- Polling units: 6,866
- Agent accounts: 922
- Agent assignments: 922
- Duplicate polling-unit codes: 0
- Duplicate ward identifiers: 0
- Polling units without a matching ward: 0
- Duplicate normalized agent phones: 0
- Agents with multiple assignments: 0
- Polling units over capacity: 0
- Orphan assignments: 0

## LGA coverage

| LGA | Wards | Polling units | Assigned agents | Occupied units | Vacant units | Coverage |
|---|---:|---:|---:|---:|---:|---:|
| Abua/Odual | 13 | 214 | 26 | 26 | 188 | 12.15% |
| Ahoada East | 13 | 176 | 20 | 20 | 156 | 11.36% |
| Ahoada West | 12 | 171 | 17 | 17 | 154 | 9.94% |
| Akuku-Toru | 17 | 244 | 41 | 41 | 203 | 16.80% |
| Andoni | 11 | 265 | 143 | 143 | 122 | 53.96% |
| Asari-Toru | 13 | 251 | 15 | 15 | 236 | 5.98% |
| Bonny | 12 | 165 | 0 | 0 | 165 | 0.00% |
| Degema | 17 | 178 | 15 | 15 | 163 | 8.43% |
| Eleme | 10 | 233 | 58 | 58 | 175 | 24.89% |
| Emohua | 14 | 280 | 12 | 12 | 268 | 4.29% |
| Etche | 19 | 271 | 19 | 19 | 252 | 7.01% |
| Gokana | 17 | 260 | 9 | 9 | 251 | 3.46% |
| Ikwerre | 13 | 312 | 0 | 0 | 312 | 0.00% |
| Khana | 19 | 359 | 14 | 14 | 345 | 3.90% |
| Obio/Akpor | 17 | 1,211 | 156 | 156 | 1,055 | 12.88% |
| Ogba/Egbema/Ndoni | 17 | 335 | 1 | 1 | 334 | 0.30% |
| Ogu/Bolo | 12 | 131 | 10 | 10 | 121 | 7.63% |
| Okrika | 12 | 170 | 154 | 154 | 16 | 90.59% |
| Omuma | 10 | 167 | 29 | 29 | 138 | 17.37% |
| Opobo/Nkoro | 11 | 154 | 16 | 16 | 138 | 10.39% |
| Oyigbo | 10 | 217 | 3 | 3 | 214 | 1.38% |
| Port Harcourt | 20 | 961 | 25 | 25 | 936 | 2.60% |
| Tai | 10 | 141 | 139 | 139 | 2 | 98.58% |

## Root cause

The database contains matching ward and polling-unit records, but bulk agent validation previously compared raw LGA and ward strings. It did not consistently normalize controlled LGA aliases, numeric ward labels, or prefixed polling-unit numbers. When a polling-unit code was supplied, only the LGA was checked; a conflicting ward or polling-unit number could pass. These design defects can produce false “not found” results or incorrect matches without any missing database record.

## Provenance limitation

The repository contains no authoritative INEC statewide source file, publication date, checksum, or source URL. Existing production records therefore cannot yet be certified as the complete current INEC register. No fabricated or inferred electoral records were added.

