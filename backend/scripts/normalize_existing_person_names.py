"""Audit/back up and normalize existing user and application full names."""

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import select

from app.database import engine
from app.models import AgentApplication, User
from app.utils.names import normalize_person_name


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--execute", action="store_true")
    parser.add_argument("--backup-dir", default="../backups")
    args = parser.parse_args()
    with engine.connect() as connection:
        user_rows = connection.execute(select(User.id, User.full_name)).all()
        application_rows = connection.execute(select(AgentApplication.id, AgentApplication.full_name)).all()
        user_changes = [{"id": row.id, "before": row.full_name, "after": normalize_person_name(row.full_name)} for row in user_rows if normalize_person_name(row.full_name) != row.full_name]
        application_changes = [{"id": row.id, "before": row.full_name, "after": normalize_person_name(row.full_name)} for row in application_rows if normalize_person_name(row.full_name) != row.full_name]
        summary = {"user_names_to_change": len(user_changes), "application_names_to_change": len(application_changes), "executed": False}
        if not args.execute:
            connection.rollback()
            print(json.dumps(summary, indent=2))
            return
        backup_root = Path(args.backup_dir).resolve(); backup_root.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        backup_path = backup_root / f"person_names_{stamp}.json"
        backup_path.write_text(json.dumps({"created_at":datetime.now(timezone.utc).isoformat(),"users":user_changes,"applications":application_changes}, indent=2), encoding="utf-8")
        backup_path.chmod(0o600)
        connection.rollback(); transaction = connection.begin()
        try:
            for item in user_changes:
                connection.execute(User.__table__.update().where(User.id==item["id"]).values(full_name=item["after"]))
            for item in application_changes:
                connection.execute(AgentApplication.__table__.update().where(AgentApplication.id==item["id"]).values(full_name=item["after"]))
            transaction.commit()
        except Exception:
            transaction.rollback(); raise
        summary.update({"executed":True,"updated_user_names":len(user_changes),"updated_application_names":len(application_changes),"backup_path":str(backup_path)})
        print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
