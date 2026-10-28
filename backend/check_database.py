from sqlalchemy import inspect, select

from app.database import engine, SessionLocal
from app.models import User, PollingUnit, AuditLog


def check_database():
    inspector = inspect(engine)

    print("\n========== DATABASE TABLES ==========")
    print(inspector.get_table_names())

    print("\n========== AUDIT LOG COLUMNS ==========")

    for column in inspector.get_columns("audit_logs"):
        print(
            f"Name: {column['name']}, "
            f"Type: {column['type']}, "
            f"Nullable: {column['nullable']}"
        )

    print("\n========== AUDIT LOG FOREIGN KEYS ==========")
    print(inspector.get_foreign_keys("audit_logs"))

    print("\n========== AUDIT LOG CONSTRAINTS ==========")
    print(inspector.get_unique_constraints("audit_logs"))
    print(inspector.get_check_constraints("audit_logs"))

    print("\n========== DATABASE RECORDS ==========")

    db = SessionLocal()

    try:
        users = db.scalars(select(User)).all()

        print("\nUsers:")

        for user in users:
            print(
                f"ID: {user.id}, "
                f"Role: {user.role}, "
                f"Active: {user.is_active}"
            )

        polling_units = db.scalars(
            select(PollingUnit).limit(10)
        ).all()

        print("\nPolling Units:")

        for unit in polling_units:
            print(
                f"ID: {unit.id}, "
                f"Code: {unit.code}, "
                f"Name: {unit.name}"
            )

        audit_logs = db.scalars(
            select(AuditLog).limit(10)
        ).all()

        print("\nAudit Logs:", len(audit_logs))

    finally:
        db.close()


if __name__ == "__main__":
    check_database()