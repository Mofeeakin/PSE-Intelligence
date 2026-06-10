"""
Enable the pgvector PostgreSQL extension.
Must run before any migration that creates a VectorField column.
"""
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("agents", "0001_initial"),
    ]

    operations = [
        migrations.RunSQL(
            sql="CREATE EXTENSION IF NOT EXISTS vector;",
            reverse_sql="DROP EXTENSION IF EXISTS vector;",
        ),
    ]
