import unittest

from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models import User
from app.routes.agent_applications import LinkCreate, create_link


class AgentApplicationLinkTests(unittest.TestCase):
    def test_admin_can_generate_global_application_link(self):
        engine = create_engine(
            "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
        )
        event.listen(engine, "connect", lambda connection, _: connection.execute("PRAGMA foreign_keys=ON"))
        Base.metadata.create_all(engine)
        with Session(engine) as db:
            admin = User(
                full_name="Admin",
                email="admin@example.com",
                hashed_password="unused",
                role="admin",
                is_active=True,
            )
            db.add(admin)
            db.commit()
            db.refresh(admin)
            result = create_link(LinkCreate(expires_in_days=30), db, admin)
            self.assertEqual(result["application_count"], 0)
            self.assertIn("/apply/agent/", result["url"])
            self.assertTrue(result["is_active"])
        engine.dispose()


if __name__ == "__main__":
    unittest.main()
