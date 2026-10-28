from sqlalchemy import select

from app.database import SessionLocal
from app.models import AuditLog


def check_audit_logs():

    db = SessionLocal()

    try:
        statement = (
            select(AuditLog)
            .order_by(AuditLog.id.desc())
            .limit(10)
        )

        logs = db.scalars(statement).all()

        if not logs:
            print("No audit logs found.")
            return

        print("\nDUMO NETWORK - AUDIT LOGS")
        print("=" * 40)

        for log in logs:

            print("--------------------------")
            print("Log ID:", log.id)
            print("Action:", log.action)
            print("User ID:", log.user_id)
            print("Record ID:", log.record_id)
            print("Old Data:", log.old_data)
            print("New Data:", log.new_data)
            print("Time:", log.created_at)

    finally:
        db.close()


if __name__ == "__main__":
    check_audit_logs()