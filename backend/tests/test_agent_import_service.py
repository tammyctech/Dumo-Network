import unittest
import io
from datetime import datetime, timezone

from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.imports.agent_service import parse_agent_file, validate_agents
from app.models import AgentAssignment, Election, PollingUnit, User
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
        report = validate_agents(self.db, records, self.election.id)
        self.assertTrue(report["can_import"])
        self.assertEqual(report["rows"][0]["polling_unit_number"], "003")
        self.assertEqual(report["rows"][0]["phone_number"], "+2348012345678")

    def test_equivalent_phone_formats_are_duplicates(self):
        records = parse_agent_file(self.csv(
            "Ada Example,08012345678,Okrika,Ward 9,003,,,\n"
            "Boma Example,+2348012345678,Okrika,Ward 9,004,,,\n"
        ), "agents.csv")
        report = validate_agents(self.db, records, self.election.id)
        self.assertIn("Phone number is duplicated in this file.", report["rows"][1]["errors"])

    def test_excel_upload_preserves_text_polling_unit_number(self):
        workbook = Workbook()
        sheet = workbook.active
        sheet.append(["Full Name", "Phone Number", "LGA", "Ward", "Polling Unit Number",
                      "Polling Unit Code", "Polling Unit Name", "Email Address"])
        sheet.append(["Ada Example", "2348012345678", "Okrika", "Ward 9", "003", "", "", ""])
        content = io.BytesIO(); workbook.save(content)
        records = parse_agent_file(content.getvalue(), "agents.xlsx")
        report = validate_agents(self.db, records, self.election.id)
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

    def test_existing_election_assignment_is_a_conflict(self):
        user = User(full_name="Existing Agent", email="agent@example.com", phone_number="+2348011111111",
                    hashed_password="not-used", role="agent", is_active=True)
        self.db.add(user); self.db.flush()
        self.db.add(AgentAssignment(election_id=self.election.id, polling_unit_id=self.unit.id, agent_id=user.id))
        self.db.commit()
        records = parse_agent_file(self.csv("Ada Example,08012345678,Okrika,Ward 9,003,,,\n"), "agents.csv")
        report = validate_agents(self.db, records, self.election.id)
        self.assertFalse(report["rows"][0]["valid"])
        self.assertIn("already has an agent", " ".join(report["rows"][0]["errors"]))


if __name__ == "__main__":
    unittest.main()
