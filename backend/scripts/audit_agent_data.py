"""Read-only agent/polling-unit integrity audit.

Usage: python scripts/audit_agent_data.py --output-dir reports/agent-data-quality
The script only executes SELECT statements and writes local CSV/JSON reports.
"""

import argparse
import csv
import json
from collections import Counter, defaultdict
from pathlib import Path

from sqlalchemy import text

from app.database import engine
from app.utils.phone import normalize_nigerian_phone

REPORTED = {
    "Diepriye Briggs": "08140346831", "Orusah Orusoso Dabiri": "07034965149",
    "Nwalozie Chimaobi": "08129431399", "Obayi Amarachi Lynda": "07066168287",
    "Ndumechi Louis": "08101656622", "Glory Biishi": "08036368489",
    "Prince C. David": "08136054828", "Mabel Ijeoma": "08128194072",
    "Chiamaka Cordelia Obi": "09035417511", "Ogbuagu Ifeoma": "08030670697",
    "Goodluck Benjamin": "08143043307", "Opara Favour": "08134656724",
}
FIELDS = ["agent_id", "full_name", "phone_number", "lga", "ward", "polling_unit_code",
          "conflict_type", "recommended_correction"]


def audit() -> tuple[list[dict], list[dict], dict]:
    with engine.connect() as db:
        agents = [dict(r._mapping) for r in db.execute(text("""
            SELECT u.id agent_id, u.full_name, u.phone_number, u.email, u.is_active,
                   aa.id assignment_id, pu.id polling_unit_id, pu.lga, pu.ward,
                   pu.code polling_unit_code, pu.name polling_unit_name
            FROM users u
            LEFT JOIN agent_assignments aa ON aa.agent_id = u.id
            LEFT JOIN polling_units pu ON pu.id = aa.polling_unit_id
            WHERE u.role = 'agent' ORDER BY u.id, aa.id
        """))]
        duplicate_codes = set(db.scalars(text(
            "SELECT code FROM polling_units GROUP BY code HAVING count(*) > 1"
        )).all())
        orphan_rows = [dict(r._mapping) for r in db.execute(text("""
            SELECT aa.id assignment_id, aa.agent_id, aa.polling_unit_id
            FROM agent_assignments aa LEFT JOIN polling_units pu ON pu.id=aa.polling_unit_id
            WHERE pu.id IS NULL
        """))]

    normalized: dict[int, str | None] = {}
    invalid_ids: set[int] = set()
    for row in agents:
        if row["agent_id"] in normalized:
            continue
        try:
            normalized[row["agent_id"]] = normalize_nigerian_phone(row["phone_number"] or "")
        except ValueError:
            normalized[row["agent_id"]] = None
            invalid_ids.add(row["agent_id"])
    phone_agents: dict[str, set[int]] = defaultdict(set)
    for agent_id, phone in normalized.items():
        if phone:
            phone_agents[phone].add(agent_id)
    duplicate_phone_ids = {i for ids in phone_agents.values() if len(ids) > 1 for i in ids}
    assignment_count = Counter(r["agent_id"] for r in agents if r["assignment_id"] is not None)
    unit_rows: dict[int, list[dict]] = defaultdict(list)
    for row in agents:
        if row["polling_unit_id"] is not None and row["is_active"]:
            unit_rows[row["polling_unit_id"]].append(row)

    report: list[dict] = []
    for row in agents:
        conflicts = []
        if row["agent_id"] in duplicate_phone_ids: conflicts.append("duplicate_normalized_phone")
        if row["agent_id"] in invalid_ids: conflicts.append("invalid_phone")
        if assignment_count[row["agent_id"]] > 1: conflicts.append("agent_multiple_polling_units")
        if row["polling_unit_id"] is not None:
            capacity = 2 if (row["lga"] or "").strip().casefold() == "tai" else 1
            if len(unit_rows[row["polling_unit_id"]]) > capacity: conflicts.append("polling_unit_over_capacity")
        if row["polling_unit_code"] in duplicate_codes: conflicts.append("duplicate_polling_unit_code")
        for conflict in conflicts:
            advice = {
                "duplicate_normalized_phone": "Administrator must identify the correct account; merge only after reviewing assignments and history.",
                "invalid_phone": "Obtain and validate the complete Nigerian mobile number; never truncate or infer digits.",
                "agent_multiple_polling_units": "Administrator must select the correct assignment and deactivate the other assignment(s).",
                "polling_unit_over_capacity": "Administrator must verify the correct agent(s); capacity is one, or two only in Tai.",
                "duplicate_polling_unit_code": "Correct the non-authoritative polling-unit record before enabling the unique constraint.",
            }[conflict]
            report.append({k: row.get(k) for k in FIELDS[:-2]} | {
                "conflict_type": conflict, "recommended_correction": advice,
            })
    for orphan in orphan_rows:
        report.append({"agent_id": orphan["agent_id"], "full_name": "", "phone_number": "",
            "lga": "", "ward": "", "polling_unit_code": str(orphan["polling_unit_id"]),
            "conflict_type": "nonexistent_polling_unit",
            "recommended_correction": "Restore the referenced unit or administrator-select a verified replacement; do not guess."})

    reported_rows = []
    for expected_name, raw_phone in REPORTED.items():
        phone = normalize_nigerian_phone(raw_phone)
        matches = [r for r in agents if normalized.get(r["agent_id"]) == phone]
        if not matches:
            reported_rows.append({"reported_name": expected_name, "normalized_phone": phone,
                "status": "not_found", "matches": []})
        else:
            reported_rows.append({"reported_name": expected_name, "normalized_phone": phone,
                "status": "administrator_resolution_required" if len({r['agent_id'] for r in matches}) > 1 or len(matches) > 1 else "single_record",
                "matches": [{k: r.get(k) for k in FIELDS[:-2]} | {"assignment_id": r["assignment_id"]} for r in matches]})
    summary = {"agent_rows": len({r['agent_id'] for r in agents}), "conflicts": len(report),
        "duplicate_normalized_phone_agents": len(duplicate_phone_ids), "invalid_phone_agents": len(invalid_ids),
        "agents_with_multiple_assignments": sum(v > 1 for v in assignment_count.values()),
        "over_capacity_polling_units": sum(len(v) > (2 if (v[0]['lga'] or '').strip().casefold() == 'tai' else 1) for v in unit_rows.values()),
        "duplicate_polling_unit_codes": len(duplicate_codes), "orphan_assignments": len(orphan_rows)}
    return report, reported_rows, summary


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", default="reports/agent-data-quality")
    args = parser.parse_args()
    output = Path(args.output_dir)
    output.mkdir(parents=True, exist_ok=True)
    report, reported, summary = audit()
    with (output / "conflicts.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDS); writer.writeheader(); writer.writerows(report)
    (output / "reported-12-cases.json").write_text(json.dumps(reported, indent=2, default=str), encoding="utf-8")
    (output / "summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
