"""Read-only statewide electoral-structure audit.

Runs all queries inside an explicitly read-only transaction and prints JSON.
It never creates, updates, or deletes database records.
"""

import json
from collections import defaultdict

from sqlalchemy import text

from app.database import engine
from app.wards.routes import RIVERS_LGAS


QUERIES = {
    "migration": "SELECT version_num FROM alembic_version",
    "table_counts": """
        SELECT (SELECT count(*) FROM wards) wards,
               (SELECT count(*) FROM polling_units) polling_units,
               (SELECT count(*) FROM users WHERE role='agent') agents,
               (SELECT count(*) FROM agent_assignments) assignments,
               (SELECT count(*) FROM elections) elections,
               (SELECT count(*) FROM result_submissions) result_submissions,
               (SELECT count(*) FROM audit_logs) audit_logs
    """,
    "coverage": """
        SELECT pu.lga, count(DISTINCT w.id) wards,
               count(DISTINCT pu.id) polling_units,
               count(DISTINCT aa.agent_id) FILTER (WHERE u.is_active) assigned_agents,
               count(DISTINCT pu.id) FILTER (WHERE aa.id IS NOT NULL AND u.is_active) occupied_units
        FROM polling_units pu
        LEFT JOIN wards w ON lower(trim(w.state))=lower(trim(pu.state))
          AND lower(trim(w.lga))=lower(trim(pu.lga))
          AND lower(trim(w.name))=lower(trim(pu.ward))
        LEFT JOIN agent_assignments aa ON aa.polling_unit_id=pu.id
        LEFT JOIN users u ON u.id=aa.agent_id
        GROUP BY pu.lga ORDER BY pu.lga
    """,
    "ward_lgas": "SELECT lga, count(*) wards FROM wards GROUP BY lga ORDER BY lga",
    "duplicate_codes": "SELECT code,count(*) n FROM polling_units GROUP BY code HAVING count(*)>1 ORDER BY n DESC,code",
    "duplicate_wards": "SELECT state,lga,ward_number,count(*) n FROM wards GROUP BY state,lga,ward_number HAVING count(*)>1",
    "unmatched_unit_wards": """
        SELECT pu.lga,pu.ward,count(*) polling_units FROM polling_units pu
        WHERE NOT EXISTS (SELECT 1 FROM wards w
          WHERE lower(trim(w.state))=lower(trim(pu.state))
            AND lower(trim(w.lga))=lower(trim(pu.lga))
            AND lower(trim(w.name))=lower(trim(pu.ward)))
        GROUP BY pu.lga,pu.ward ORDER BY pu.lga,pu.ward
    """,
    "invalid_code_candidates": """
        SELECT id,code,lga,ward FROM polling_units
        WHERE trim(coalesce(code,''))='' OR code !~ '[0-9]' ORDER BY id
    """,
    "duplicate_agent_phones": """
        SELECT regexp_replace(phone_number,'[^0-9]','','g') normalized,count(*) n
        FROM users WHERE role='agent' AND phone_number IS NOT NULL
        GROUP BY 1 HAVING count(*)>1
    """,
    "multi_assignments": "SELECT agent_id,count(*) n FROM agent_assignments GROUP BY agent_id HAVING count(*)>1",
    "over_capacity": """
        SELECT pu.id,pu.code,pu.lga,count(*) FILTER (WHERE u.is_active) active_agents
        FROM polling_units pu JOIN agent_assignments aa ON aa.polling_unit_id=pu.id
        JOIN users u ON u.id=aa.agent_id GROUP BY pu.id,pu.code,pu.lga
        HAVING count(*) FILTER (WHERE u.is_active) >
          CASE WHEN lower(trim(pu.lga))='tai' THEN 2 ELSE 1 END
    """,
    "orphan_assignments": """
        SELECT aa.id FROM agent_assignments aa
        LEFT JOIN users u ON u.id=aa.agent_id
        LEFT JOIN polling_units pu ON pu.id=aa.polling_unit_id
        WHERE u.id IS NULL OR pu.id IS NULL
    """,
}


def main() -> None:
    report: dict[str, object] = {}
    with engine.connect() as connection:
        transaction = connection.begin()
        connection.execute(text("SET TRANSACTION READ ONLY"))
        for name, statement in QUERIES.items():
            report[name] = [dict(row._mapping) for row in connection.execute(text(statement))]
        transaction.rollback()

    coverage = {str(row["lga"]).casefold(): row for row in report["coverage"]}
    wards = defaultdict(int, {str(row["lga"]).casefold(): row["wards"] for row in report["ward_lgas"]})
    report["missing_lgas"] = [
        lga for lga in RIVERS_LGAS
        if lga.casefold() not in coverage and not wards[lga.casefold()]
    ]
    for row in report["coverage"]:
        row["vacant_units"] = max(0, row["polling_units"] - row["occupied_units"])
        row["coverage_percent"] = round(100 * row["occupied_units"] / row["polling_units"], 2) if row["polling_units"] else 0
    print(json.dumps(report, indent=2, default=str))


if __name__ == "__main__":
    main()
