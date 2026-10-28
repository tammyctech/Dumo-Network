import csv
import re
import sys
from pathlib import Path

from app.database import SessionLocal
from app.imports.service import parse_ward_csv
from app.models import Ward


def main():
    if len(sys.argv) < 2:
        print("Usage: python -m scripts.update_placeholder_wards <csv_file> [--apply]")
        return

    csv_path = Path(sys.argv[1])
    apply_changes = "--apply" in sys.argv[2:]

    if not csv_path.is_file():
        print(f"CSV file not found: {csv_path}")
        return

    records, errors = parse_ward_csv(csv_path.read_bytes())

    if errors:
        print(f"Import validation found {len(errors)} errors.")
        for error in errors[:20]:
            print(error)
        print("No database changes made.")
        return

    db = SessionLocal()

    try:
        updates = []
        conflicts = []

        for record in records:
            ward = (
                db.query(Ward)
                .filter(
                    Ward.state == "Rivers",
                    Ward.lga == record["lga"],
                    Ward.ward_number == record["ward_number"],
                )
                .one_or_none()
            )

            if ward is None:
                continue

            new_name = record["ward_name"]

            if ward.name.casefold() == new_name.casefold():
                continue

            expected_placeholder = f"Ward {record['ward_number']}"

            if ward.name.casefold() != expected_placeholder.casefold():
                conflicts.append(
                    f"{record['lga']} #{record['ward_number']}: "
                    f"existing name '{ward.name}' is not a placeholder."
                )
                continue

            # Prevent duplicate names within an LGA.
            duplicate = (
                db.query(Ward)
                .filter(
                    Ward.state == "Rivers",
                    Ward.lga == record["lga"],
                    Ward.name == new_name,
                    Ward.id != ward.id,
                )
                .first()
            )

            if duplicate:
                conflicts.append(
                    f"{record['lga']} #{record['ward_number']}: "
                    f"'{new_name}' already exists as ward #{duplicate.ward_number}."
                )
                continue

            updates.append((ward, new_name))

        print(f"Placeholder wards eligible for update: {len(updates)}")
        print(f"Conflicts: {len(conflicts)}")

        for ward, new_name in updates:
            print(
                f"{ward.lga} #{ward.ward_number}: "
                f"'{ward.name}' -> '{new_name}'"
            )

        for conflict in conflicts:
            print("CONFLICT:", conflict)

        if conflicts:
            print("No database changes made. Resolve conflicts first.")
            return

        if not apply_changes:
            print("\nDRY RUN ONLY. No database changes made.")
            print("Run again with --apply after reviewing the changes.")
            return

        confirmation = input(
            "\nType UPDATE to confirm these changes: "
        )

        if confirmation != "UPDATE":
            print("Cancelled. No database changes made.")
            return

        for ward, new_name in updates:
            ward.name = new_name

        db.commit()
        print(f"Successfully updated {len(updates)} placeholder wards.")

    except Exception:
        db.rollback()
        raise

    finally:
        db.close()


if __name__ == "__main__":
    main()