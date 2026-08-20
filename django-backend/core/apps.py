from django.apps import AppConfig
from django.db.models.signals import post_migrate

import logging

logger = logging.getLogger(__name__)


def auto_import_historical_data(sender, **kwargs):
    """
    Runs automatically right after `python manage.py migrate` finishes.

    Without this, a fresh clone of the project has zero incidents until
    someone remembers to separately run import_incidents.py — and an
    empty Incident table is exactly why hotspots silently don't show up
    on the map (the endpoint works fine, there's just nothing in it).
    Only imports when the table is actually empty, so it's safe to run
    on every `migrate` without duplicating data.
    """
    from core.models import Incident

    if Incident.objects.exists():
        return

    try:
        import sys
        from pathlib import Path
        sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
        from import_incidents import main as run_incident_import
        logger.info("Incident table is empty — auto-importing incident data...")
        run_incident_import()
    except Exception:
        logger.warning("Auto-import of historical data skipped", exc_info=True)


class CoreConfig(AppConfig):
    name = 'core'

    def ready(self):
        post_migrate.connect(auto_import_historical_data, sender=self)
