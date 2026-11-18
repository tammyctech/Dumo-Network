"""Audit, back up, and explicitly delete every legacy observer account.

Default mode is read-only. Pass --execute to create a local JSON backup and
delete observer users plus their dependent records in one transaction.
"""

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import inspect, text

from app.database import engine


def observer_dependencies(connection) -> list[tuple[str, str]]:
    dependencies = []
    for table in inspect(connection).get_table_names():
        for foreign_key in inspect(connection).get_foreign_keys(table):
            if foreign_key.get("referred_table") != "users":
                continue
            for column, referred in zip(foreign_key.get("constrained_columns", []), foreign_key.get("referred_columns", [])):
                if referred == "id":
                    dependencies.append((table, column))
    return sorted(set(dependencies))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--execute", action="store_true")
    parser.add_argument("--backup-dir", default="../backups")
    args = parser.parse_args()
    with engine.connect() as connection:
        observers = [dict(row._mapping) for row in connection.execute(text(
            "SELECT * FROM users WHERE lower(trim(role))='observer' ORDER BY id"
        ))]
        observer_ids = [row["id"] for row in observers]
        dependencies = observer_dependencies(connection)
        dependent_rows = {}
        if observer_ids:
            for table, column in dependencies:
                result = connection.execute(text(
                    f'SELECT * FROM "{table}" WHERE "{column}" = ANY(:ids)'
                ), {"ids": observer_ids})
                rows = [dict(row._mapping) for row in result]
                if rows:
                    dependent_rows[f"{table}.{column}"] = rows
        summary = {
            "observer_accounts": len(observers),
            "dependent_rows": {key: len(value) for key, value in dependent_rows.items()},
            "executed": False,
        }
        if not args.execute:
            print(json.dumps(summary, indent=2, default=str))
            return
        backup_root = Path(args.backup_dir).resolve()
        backup_root.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        backup_path = backup_root / f"all_observers_{stamp}.json"
        backup_path.write_text(json.dumps({
            "created_at": datetime.now(timezone.utc).isoformat(),
            "observers": observers,
            "dependent_rows": dependent_rows,
        }, indent=2, default=str), encoding="utf-8")
        backup_path.chmod(0o600)
        connection.rollback()
        transaction = connection.begin()
        try:
            for table, column in reversed(dependencies):
                connection.execute(text(f'DELETE FROM "{table}" WHERE "{column}" = ANY(:ids)'), {"ids": observer_ids})
            deleted = connection.execute(text(
                "DELETE FROM users WHERE lower(trim(role))='observer' RETURNING id"
            )).all()
            transaction.commit()
        except Exception:
            transaction.rollback()
            raise
        summary.update({"executed": True, "deleted_observers": len(deleted), "backup_path": str(backup_path)})
        print(json.dumps(summary, indent=2, default=str))


if __name__ == "__main__":
    main()
