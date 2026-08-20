"""
python manage.py seed_data

Populates the database with:
  1. ~34 "current" hotspot-style incidents (source=System) spread across
     Ahmedabad, matching the areas/types/severities used throughout the
     project — these double as map hotspots AND alert feed entries.
  2. Backdated incidents across the last 5 years so the Yearly Analysis
     aggregation endpoint has real history to summarize instead of an
     empty chart.

Safe to re-run: clears previously seeded (System-source) rows first so
you don't get duplicates on repeat runs. Community-reported incidents
(source=Community) are left untouched.
"""
import random
from datetime import datetime, timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from core.models import Incident

AREAS = [
    ("Kalupur", 23.0292, 72.5811), ("SG Highway", 23.0339, 72.5540),
    ("Vasna", 23.0100, 72.5470), ("Naroda", 23.0480, 72.5290),
    ("Khokhra", 23.0180, 72.5850), ("Nikol", 23.0225, 72.5980),
    ("Naranpura", 23.0390, 72.5700), ("Paldi", 23.0155, 72.5620),
    ("Maninagar", 23.0060, 72.5550), ("Chandkheda", 23.0480, 72.5610),
    ("Sarkhej", 23.0260, 72.5390), ("Vejalpur", 23.0325, 72.5455),
    ("Bapunagar", 23.0410, 72.5850), ("Isanpur", 22.9990, 72.5490),
    ("Bopal", 23.0210, 72.5290), ("Gota", 23.0555, 72.5330),
    ("Navrangpura", 23.0270, 72.5665),
]

TYPES = ["Theft", "Harassment", "Lighting", "Construction", "Road-block"]
SEVERITIES = ["Low", "Medium", "High"]

DESCRIPTIONS = {
    "Theft": "Multiple theft/snatching reports in this area.",
    "Harassment": "Community reports of harassment, especially after dark.",
    "Lighting": "Non-functional or missing streetlights reported.",
    "Construction": "Unmarked construction/excavation blocking the footpath.",
    "Road-block": "Encroachment or debris obstructing pedestrian access.",
}


class Command(BaseCommand):
    help = "Seed the database with demo hotspot and historical incident data."

    def handle(self, *args, **options):
        deleted, _ = Incident.objects.filter(source="System").delete()
        self.stdout.write(f"Cleared {deleted} previously seeded System incidents.")

        rng = random.Random(42)
        created = 0

        # --- 1. Current hotspots (recent timestamps, 1-2 per area) ---
        for area, lat, lon in AREAS:
            for _ in range(rng.choice([1, 2])):
                itype = rng.choice(TYPES)
                severity = rng.choices(SEVERITIES, weights=[3, 4, 3])[0]
                jitter = lambda v: v + rng.uniform(-0.003, 0.003)
                Incident.objects.create(
                    incident_type=itype, severity=severity,
                    location_label=area, lat=jitter(lat), lon=jitter(lon),
                    description=DESCRIPTIONS[itype], source="System",
                )
                created += 1

        # --- 2. Backdated history across the last 5 years, for analysis charts ---
        now = timezone.now()
        for years_ago in range(5, -1, -1):
            year_start = now - timedelta(days=365 * years_ago)
            # More incidents in more recent years, mirrors realistic reporting growth
            count = int(60 + (5 - years_ago) * 15)
            for _ in range(count):
                area, lat, lon = rng.choice(AREAS)
                itype = rng.choice(TYPES)
                severity = rng.choices(SEVERITIES, weights=[3, 4, 3])[0]
                day_offset = rng.randint(0, 364)
                created_at = year_start - timedelta(days=day_offset)
                jitter = lambda v: v + rng.uniform(-0.01, 0.01)

                inc = Incident.objects.create(
                    incident_type=itype, severity=severity,
                    location_label=area, lat=jitter(lat), lon=jitter(lon),
                    description=DESCRIPTIONS[itype], source="System",
                )
                # created_at has auto_now_add=True, so it must be updated
                # after creation via a queryset update (bypasses auto_now_add).
                Incident.objects.filter(pk=inc.pk).update(created_at=created_at)
                created += 1

        self.stdout.write(self.style.SUCCESS(f"Seeded {created} incidents."))
