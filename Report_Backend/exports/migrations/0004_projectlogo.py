from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("exports", "0003_reportlogo_pages_selected_placement"),
        ("reports", "0006_report_assigned_to_project_report_project"),
    ]

    operations = [
        migrations.CreateModel(
            name="ProjectLogo",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("image", models.ImageField(upload_to="project_logos/%Y/%m/")),
                (
                    "placement",
                    models.CharField(
                        choices=[
                            ("cover_only",     "Cover Page Only"),
                            ("every_page",     "Every Page (Page Header)"),
                            ("selected_pages", "Selected Pages"),
                        ],
                        default="cover_only",
                        max_length=20,
                    ),
                ),
                ("pages",        models.JSONField(blank=True, default=list)),
                ("width_inches", models.FloatField(default=2.4)),
                ("created_at",   models.DateTimeField(auto_now_add=True)),
                (
                    "project",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="logo",
                        to="reports.project",
                    ),
                ),
            ],
        ),
    ]
