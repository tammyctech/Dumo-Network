"""Enforce normalized agent and polling-unit assignment integrity.

Revision ID: 6c2f4a9d8e10
Revises: f3a8c1d4e6b2

This migration never chooses a winning legacy record. Existing duplicate-agent
assignments are preserved, while triggers prevent creating any new conflicts.
The unique constraint is installed automatically only when the legacy data is
already clean.
"""

from alembic import op
import sqlalchemy as sa

revision = "6c2f4a9d8e10"
down_revision = "f3a8c1d4e6b2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(sa.text("""
        DO $$
        BEGIN
          IF EXISTS (
            SELECT 1
            FROM agent_assignments aa
            JOIN polling_units pu ON pu.id = aa.polling_unit_id
            JOIN users u ON u.id = aa.agent_id AND u.is_active
            GROUP BY pu.id, pu.lga
            HAVING count(*) > CASE WHEN lower(trim(pu.lga)) = 'tai' THEN 2 ELSE 1 END
          ) THEN
            RAISE EXCEPTION 'Unresolved polling-unit capacity conflicts. Run the agent data-quality audit first.';
          END IF;
        END $$;
    """))
    op.drop_constraint("uq_assignment_polling_unit", "agent_assignments", type_="unique")
    op.execute(sa.text("""
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM agent_assignments GROUP BY agent_id HAVING count(*) > 1
          ) THEN
            ALTER TABLE agent_assignments
              ADD CONSTRAINT uq_assignment_agent UNIQUE (agent_id);
          END IF;
        END $$;

        CREATE OR REPLACE FUNCTION enforce_polling_unit_agent_capacity()
        RETURNS trigger LANGUAGE plpgsql AS $$
        DECLARE max_agents integer; active_agent boolean; assigned integer;
        BEGIN
          PERFORM 1 FROM polling_units WHERE id = NEW.polling_unit_id FOR UPDATE;
          SELECT CASE WHEN lower(trim(lga)) = 'tai' THEN 2 ELSE 1 END
            INTO max_agents FROM polling_units WHERE id = NEW.polling_unit_id;
          SELECT is_active INTO active_agent FROM users WHERE id = NEW.agent_id;
          IF active_agent THEN
            SELECT count(*) INTO assigned
            FROM agent_assignments aa JOIN users u ON u.id = aa.agent_id
            WHERE aa.polling_unit_id = NEW.polling_unit_id AND u.is_active
              AND aa.id IS DISTINCT FROM NEW.id;
            IF assigned >= max_agents THEN
              RAISE EXCEPTION 'polling unit has reached active-agent capacity'
                USING ERRCODE = '23514';
            END IF;
          END IF;
          RETURN NEW;
        END $$;
        CREATE TRIGGER trg_polling_unit_agent_capacity
        BEFORE INSERT OR UPDATE OF polling_unit_id, agent_id ON agent_assignments
        FOR EACH ROW EXECUTE FUNCTION enforce_polling_unit_agent_capacity();

        CREATE OR REPLACE FUNCTION prevent_new_duplicate_agent_assignment()
        RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          PERFORM 1 FROM users WHERE id = NEW.agent_id FOR UPDATE;
          IF EXISTS (
            SELECT 1 FROM agent_assignments
            WHERE agent_id = NEW.agent_id AND id IS DISTINCT FROM NEW.id
          ) THEN
            RAISE EXCEPTION 'agent already has a polling-unit assignment'
              USING ERRCODE = '23505';
          END IF;
          RETURN NEW;
        END $$;
        CREATE TRIGGER trg_prevent_new_duplicate_agent_assignment
        BEFORE INSERT OR UPDATE OF agent_id ON agent_assignments
        FOR EACH ROW EXECUTE FUNCTION prevent_new_duplicate_agent_assignment();
    """))


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_polling_unit_agent_capacity ON agent_assignments")
    op.execute("DROP FUNCTION IF EXISTS enforce_polling_unit_agent_capacity()")
    op.execute("DROP TRIGGER IF EXISTS trg_prevent_new_duplicate_agent_assignment ON agent_assignments")
    op.execute("DROP FUNCTION IF EXISTS prevent_new_duplicate_agent_assignment()")
    op.execute("ALTER TABLE agent_assignments DROP CONSTRAINT IF EXISTS uq_assignment_agent")
    op.create_unique_constraint("uq_assignment_polling_unit", "agent_assignments", ["polling_unit_id"])
