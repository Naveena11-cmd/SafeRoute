"""
python import_incidents.py

Loads real incident data into the Incident table, tagged
source="Historical" so it's cleanly distinguishable from seed_data.py's
synthetic baseline (source="System") and user reports
(source="Community") — each can be cleared/reimported independently.

By default this loads whatever is configured as INCIDENT_DATA_SOURCE
(settings.py / env var) — a local path or a remote http(s) URL such as
a city open-data portal export — normalizing its columns automatically
(see core/services/incident_ingest.py). If that source is unset,
offline, or fails to parse, it automatically falls back to the
bundled, hand-curated core/data.csv so the app never ends up with zero
incident data just because an external dataset is temporarily down.

This also runs automatically after every `python manage.py migrate`
(see core/apps.py) if the Incident table is empty, so a fresh clone
shows hotspots out of the box without a manual step being remembered
or missed.

Run directly from django-backend/:
    python import_incidents.py
    python import_incidents.py https://example.gov/open-data/incidents.csv

Or via the ingest_incidents management command for more control:
    python manage.py ingest_incidents --source <path-or-url> --tag Historical
"""
import os
import sys


def main(source=None):
    # Imported django.setup() lazily and only here (not at module import
    # time) so this file can also be safely imported from *inside* an
    # already-running Django process (core/apps.py's post_migrate hook
    # does exactly that) without trying to set Django up a second time.
    import django
    if not django.apps.apps.ready:
        os.environ.setdefault("DJANGO_SETTINGS_MODULE", "saferoute_project.settings")
        django.setup()

    from core.services.incident_ingest import ingest_incidents

    result = ingest_incidents(source=source)
    print(f"Source used: {result['source_used']}" + (" (fallback)" if result["fallback_used"] else ""))
    print(f"Imported: {result['imported']} incidents")

    from core.models import Incident
    print(f"Total incidents in database: {Incident.objects.count()}")
    return result


if __name__ == "__main__":
    main(source=sys.argv[1] if len(sys.argv) > 1 else None)
