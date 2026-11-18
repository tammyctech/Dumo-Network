"""Read-only audit for Oyigbo agent-import troubleshooting."""

import json

from sqlalchemy import text

from app.database import engine


PHONES = (
    "+2347047674538", "+2349119135208", "+2347025703176",
    "+2349034828826", "+2347066168287",
)


def rows(connection, statement: str, parameters: dict | None = None) -> list[dict]:
    return [dict(row._mapping) for row in connection.execute(text(statement), parameters or {})]


def main() -> None:
    with engine.connect() as connection:
        transaction = connection.begin()
        connection.execute(text("SET TRANSACTION READ ONLY"))
        report = {
            "oyigbo_wards": rows(connection, """
                SELECT id, state, lga, ward_number, name FROM wards
                WHERE lower(trim(lga))='oyigbo' AND ward_number BETWEEN 7 AND 10
                ORDER BY ward_number
            """),
            "ward_polling_units": rows(connection, """
                SELECT w.ward_number, w.name ward_name, count(pu.id) polling_units,
                       min(pu.code) first_code, max(pu.code) last_code
                FROM wards w LEFT JOIN polling_units pu
                  ON lower(trim(pu.state))=lower(trim(w.state))
                 AND lower(trim(pu.lga))=lower(trim(w.lga))
                 AND lower(trim(pu.ward))=lower(trim(w.name))
                WHERE lower(trim(w.lga))='oyigbo' AND w.ward_number BETWEEN 7 AND 10
                GROUP BY w.ward_number,w.name ORDER BY w.ward_number
            """),
            "polling_units": rows(connection, """
                SELECT pu.id, w.ward_number, pu.ward, pu.code, pu.name,
                       (regexp_match(pu.code, '([0-9]+)$'))[1] stored_number_text
                FROM polling_units pu JOIN wards w
                  ON lower(trim(pu.state))=lower(trim(w.state))
                 AND lower(trim(pu.lga))=lower(trim(w.lga))
                 AND lower(trim(pu.ward))=lower(trim(w.name))
                WHERE lower(trim(pu.lga))='oyigbo' AND w.ward_number BETWEEN 7 AND 10
                ORDER BY w.ward_number,pu.code
            """),
            "users": rows(connection, """
                SELECT u.id, u.full_name, u.phone_number, u.email, u.role, u.is_active,
                       aa.id assignment_id, pu.id polling_unit_id, pu.code polling_unit_code,
                       pu.lga, pu.ward, pu.name polling_unit_name
                FROM users u LEFT JOIN agent_assignments aa ON aa.agent_id=u.id
                LEFT JOIN polling_units pu ON pu.id=aa.polling_unit_id
                WHERE u.phone_number = ANY(:phones) ORDER BY u.id,aa.id
            """, {"phones": list(PHONES)}),
            "users_by_name_or_digits": rows(connection, """
                SELECT u.id,u.full_name,u.phone_number,u.email,u.role,u.is_active,
                       aa.id assignment_id,pu.code polling_unit_code,pu.lga,pu.ward
                FROM users u LEFT JOIN agent_assignments aa ON aa.agent_id=u.id
                LEFT JOIN polling_units pu ON pu.id=aa.polling_unit_id
                WHERE lower(u.full_name) LIKE ANY(ARRAY['%frederick%priscilla%','%sunday%peter%',
                  '%udeme%glory%','%israel%chinaza%','%obayi%amarachi%'])
                   OR right(regexp_replace(coalesce(u.phone_number,''),'[^0-9]','','g'),10)
                      = ANY(ARRAY['7047674538','9119135208','7025703176','9034828826','7066168287'])
                ORDER BY u.id,aa.id
            """),
            "relevant_audit_logs": rows(connection, """
                SELECT id,user_id,action,table_name,record_id,old_data,new_data,created_at
                FROM audit_logs WHERE record_id IN (2302,2303,2313)
                   OR new_data::text ILIKE ANY(ARRAY['%Frederick Priscilla%','%Sunday Peter%',
                     '%Udeme Glory%','%Israel Chinaza%','%Obayi Amarachi%'])
                ORDER BY id
            """),
        }
        transaction.rollback()
    print(json.dumps(report, indent=2, default=str))


if __name__ == "__main__":
    main()
