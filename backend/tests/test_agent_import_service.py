import unittest
import io
from datetime import datetime, timezone

from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.imports.agent_service import parse_agent_file, validate_agents
from app.imports.agent_routes import _apply_polling_unit_overrides, clear_history, placeholder_email
from app.models import AgentAssignment, AgentImport, AgentImportRow, Election, PollingUnit, User
from openpyxl import Workbook


class AgentImportServiceTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
        )
        event.listen(self.engine, "connect", lambda connection, _: connection.execute("PRAGMA foreign_keys=ON"))
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        self.election = Election(
            name="Test Election", election_date=datetime.now(timezone.utc), state="Rivers"
        )
        self.unit = PollingUnit(
            code="33-21-09-003", name="Community School", state="Rivers", lga="Okrika", ward="Ward 9"
        )
        self.db.add_all([self.election, self.unit]); self.db.commit()

    def tearDown(self):
        self.db.close(); self.engine.dispose()

    @staticmethod
    def csv(rows: str) -> bytes:
        return ("Full Name,Phone Number,LGA,Ward,Polling Unit Number,Polling Unit Code,Polling Unit Name,Email Address\n" + rows).encode()

    def test_csv_preserves_leading_zero_and_normalizes_phone(self):
        records = parse_agent_file(self.csv("Ada Example,08012345678,Okrika,Ward 9,003,,,\n"), "agents.csv")
        report = validate_agents(self.db, records)
        self.assertTrue(report["can_import"])
        self.assertEqual(report["rows"][0]["polling_unit_number"], "003")
        self.assertEqual(report["rows"][0]["phone_number"], "+2348012345678")

    def test_equivalent_phone_formats_are_duplicates(self):
        records = parse_agent_file(self.csv(
            "Ada Example,08012345678,Okrika,Ward 9,003,,,\n"
            "Boma Example,+2348012345678,Okrika,Ward 9,004,,,\n"
        ), "agents.csv")
        report = validate_agents(self.db, records)
        self.assertIn("Phone number is duplicated in this file.", report["rows"][1]["errors"])

    def test_excel_upload_preserves_text_polling_unit_number(self):
        workbook = Workbook()
        sheet = workbook.active
        sheet.append(["Full Name", "Phone Number", "LGA", "Ward", "Polling Unit Number",
                      "Polling Unit Code", "Polling Unit Name", "Email Address"])
        sheet.append(["Ada Example", "2348012345678", "Okrika", "Ward 9", "003", "", "", ""])
        content = io.BytesIO(); workbook.save(content)
        records = parse_agent_file(content.getvalue(), "agents.xlsx")
        report = validate_agents(self.db, records)
        self.assertTrue(report["rows"][0]["valid"])
        self.assertEqual(report["rows"][0]["polling_unit_number"], "003")

    def test_excel_number_format_preserves_leading_zero(self):
        workbook = Workbook(); sheet = workbook.active
        sheet.append(["Full Name", "Phone Number", "LGA", "Ward", "Polling Unit Number",
                      "Polling Unit Code", "Polling Unit Name", "Email Address"])
        sheet.append(["Ada Example", "08012345678", "Okrika", "Ward 9", 3, "", "", ""])
        sheet["E2"].number_format = "000"
        content = io.BytesIO(); workbook.save(content)
        records = parse_agent_file(content.getvalue(), "agents.xlsx")
        self.assertEqual(records[0]["polling unit number"], "003")

    def test_exact_code_resolves_unit_when_ward_label_differs(self):
        records = parse_agent_file(self.csv(
            "Ada Example,08012345678,Okrika,Ward 09,003,33-21-09-003,,\n"
        ), "agents.csv")
        report = validate_agents(self.db, records)
        self.assertTrue(report["rows"][0]["valid"])
        self.assertEqual(report["rows"][0]["polling_unit_id"], self.unit.id)

    def test_existing_election_assignment_is_a_conflict(self):
        user = User(full_name="Existing Agent", email="agent@example.com", phone_number="+2348011111111",
                    hashed_password="not-used", role="agent", is_active=True)
        self.db.add(user); self.db.flush()
        self.db.add(AgentAssignment(election_id=None, polling_unit_id=self.unit.id, agent_id=user.id))
        self.db.commit()
        records = parse_agent_file(self.csv("Ada Example,08012345678,Okrika,Ward 9,003,,,\n"), "agents.csv")
        report = validate_agents(self.db, records)
        self.assertFalse(report["rows"][0]["valid"])
        self.assertIn("already has a permanent agent", " ".join(report["rows"][0]["errors"]))

    def test_occupied_unit_can_be_replaced_and_revalidated(self):
        user = User(full_name="Existing Agent", email="existing@example.com", phone_number="+2348011111111",
                    hashed_password="not-used", role="agent", is_active=True)
        replacement = PollingUnit(
            code="33-21-09-004", name="Town Hall", state="Rivers", lga="Okrika", ward="Ward 9"
        )
        self.db.add_all([user, replacement]); self.db.flush()
        self.db.add(AgentAssignment(election_id=None, polling_unit_id=self.unit.id, agent_id=user.id))
        self.db.commit()
        records = parse_agent_file(self.csv("Ada Example,08012345678,Okrika,Ward 9,003,,,,\n"), "agents.csv")

        initial = validate_agents(self.db, records)
        changed_records = _apply_polling_unit_overrides(
            self.db, records, '{"2": %d}' % replacement.id
        )
        changed = validate_agents(self.db, changed_records)

        self.assertFalse(initial["rows"][0]["valid"])
        self.assertTrue(changed["rows"][0]["valid"])
        self.assertEqual(changed["rows"][0]["polling_unit_id"], replacement.id)
        self.assertEqual(changed["rows"][0]["polling_unit_code"], replacement.code)

    def test_placeholder_email_uses_agent_name_and_resolves_duplicates(self):
        used = {"showers.eneni@dumo-network.vercel.app"}
        value = placeholder_email("Showers Eneni", "+2347044627066", used)
        self.assertEqual(value, "showers.eneni.7066@dumo-network.vercel.app")
        self.assertEqual(
            placeholder_email("Blessing Peter", "+2348072685189", used),
            "blessing.peter@dumo-network.vercel.app",
        )

    def test_clear_history_preserves_agents_and_assignments(self):
        admin = User(full_name="Admin", email="admin@example.com", hashed_password="unused", role="admin", is_active=True)
        agent = User(full_name="Imported Agent", email="agent@example.com", phone_number="+2348012345678", hashed_password="unused", role="agent", is_active=True)
        self.db.add_all([admin, agent]); self.db.flush()
        assignment = AgentAssignment(election_id=None, polling_unit_id=self.unit.id, agent_id=agent.id)
        history = AgentImport(administrator_id=admin.id, filename="agents.xlsx", total_records=1, registered_agents=1, assigned_agents=1)
        self.db.add_all([assignment, history]); self.db.flush()
        self.db.add(AgentImportRow(import_id=history.id, row_number=2, status="imported", agent_id=agent.id, polling_unit_id=self.unit.id))
        self.db.commit()

        result = clear_history(admin, self.db)

        self.assertEqual(result["imports_deleted"], 1)
        self.assertEqual(result["rows_deleted"], 1)
        self.assertIsNotNone(self.db.get(User, agent.id))
        self.assertIsNotNone(self.db.get(AgentAssignment, assignment.id))


if __name__ == "__main__":
    unittest.main()
