from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("exports", "0002_reportlogo"),
    ]

    operations = [
        migrations.AddField(
            model_name="reportlogo",
            name="pages",
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AlterField(
            model_name="reportlogo",
            name="placement",
            field=models.CharField(
                choices=[
                    ("cover_only", "Cover Page Only"),
                    ("every_page", "Every Page (Page Header)"),
                    ("selected_pages", "Selected Pages"),
                ],
                default="cover_only",
                max_length=20,
            ),
        ),
    ]
