from django.core.management.base import BaseCommand
from django.core.management import call_command


class Command(BaseCommand):
    help = "Load ISO 27001 standard, clauses, and requirements from fixture"

    def handle(self, *args, **options):
        self.stdout.write("Loading ISO 27001 fixture...")
        call_command("loaddata", "iso27001", app_label="reports", verbosity=1)
        self.stdout.write(self.style.SUCCESS("ISO 27001 data loaded successfully."))
