"""
python manage.py ingest_incidents [--source PATH_OR_URL] [--tag Historical]

Loads real incident data (CSV or JSON, local path or http(s) URL) into
the Incident table via core.services.incident_ingest, normalizing
whatever column names the source dataset happens to use. Falls back to
the bundled core/data.csv automatically if the given/configured source
is unreachable or fails to parse.
"""
from django.core.management.base import BaseCommand

from core.services.incident_ingest import ingest_incidents


class Command(BaseCommand):
    help = "Ingest real incident data (CSV/JSON, local or remote) into the Incident table."

    def add_arguments(self, parser):
        parser.add_argument(
            "--source", default=None,
            help="Local path or http(s) URL to a CSV/JSON incident dataset. "
                 "Defaults to settings.INCIDENT_DATA_SOURCE, then core/data.csv.",
        )
        parser.add_argument(
            "--tag", default="Historical",
            help="Incident.source value to tag imported rows with (default: Historical). "
                 "Re-running with the same tag replaces only that tag's previous rows.",
        )

    def handle(self, *args, **options):
        result = ingest_incidents(source=options["source"], source_tag=options["tag"])

        if result["fallback_used"]:
            self.stdout.write(self.style.WARNING(
                f"Requested source failed — fell back to {result['source_used']}"
            ))
        else:
            self.stdout.write(f"Source: {result['source_used']}")

        self.stdout.write(self.style.SUCCESS(
            f"Imported {result['imported']} incidents tagged '{options['tag']}'."
        ))
