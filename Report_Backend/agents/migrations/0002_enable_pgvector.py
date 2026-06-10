"""
Enable the pgvector PostgreSQL extension.
Must run before any migration that creates a VectorField column.
Non-fatal: if pgvector is unavailable (e.g. Render free Postgres),
the migration logs a warning and continues — RAG is disabled but
core report generation still works.
"""
import logging
from django.db import migrations

logger = logging.getLogger(__name__)


def enable_pgvector(apps, schema_editor):
    try:
        schema_editor.execute("CREATE EXTENSION IF NOT EXISTS vector;")
        logger.info("pgvector extension enabled.")
    except Exception as exc:
        logger.warning("pgvector unavailable — RAG features disabled. (%s)", exc)


def disable_pgvector(apps, schema_editor):
    try:
        schema_editor.execute("DROP EXTENSION IF EXISTS vector;")
    except Exception:
        pass


class Migration(migrations.Migration):

    dependencies = [
        ("agents", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(enable_pgvector, disable_pgvector),
    ]
