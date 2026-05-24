"""Add start_time column to tournaments table

Revision ID: add_start_time_col
Revises: 
Create Date: 2026-05-23
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers
revision = 'add_start_time_col'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add start_time column if it doesn't exist
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'tournaments' AND column_name = 'start_time'
            ) THEN
                ALTER TABLE tournaments ADD COLUMN start_time VARCHAR NULL;
            END IF;
        END $$;
    """)


def downgrade() -> None:
    op.execute("ALTER TABLE tournaments DROP COLUMN IF EXISTS start_time;")