from django.conf import settings
from django.contrib.auth.models import AbstractUser
from django.db import models


class SafeRouteUser(AbstractUser):
    """
    Custom Django user model (Django Models and Users).
    Extends the built-in auth user so we get Django's battle-tested
    password hashing, login, and admin integration for free, while still
    letting us add app-specific fields.
    """
    full_name = models.CharField(max_length=120, blank=True)

    def __str__(self):
        return self.email or self.username


class Incident(models.Model):
    """A community- or system-reported safety incident. Becomes a hotspot
    signal used to score routes for other pedestrians."""

    TYPE_CHOICES = [
        ("Theft", "Theft"),
        ("Harassment", "Harassment"),
        ("Lighting", "Lighting"),
        ("Construction", "Construction"),
        ("Road-block", "Road-block"),
        ("Other", "Other"),
    ]
    SEVERITY_CHOICES = [("Low", "Low"), ("Medium", "Medium"), ("High", "High")]
    SOURCE_CHOICES = [
        ("System", "System"), ("Community", "Community"), ("Historical", "Historical"),
    ]

    incident_type = models.CharField(max_length=20, choices=TYPE_CHOICES)
    severity = models.CharField(max_length=10, choices=SEVERITY_CHOICES, default="Medium")
    location_label = models.CharField(max_length=200)
    lat = models.FloatField()
    lon = models.FloatField()
    description = models.TextField(blank=True)
    source = models.CharField(max_length=10, choices=SOURCE_CHOICES, default="Community")
    reported_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="incidents",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["lat", "lon"])]

    def __str__(self):
        return f"{self.incident_type} @ {self.location_label} ({self.severity})"


class SavedRoute(models.Model):
    """A route a logged-in user planned, with its computed safety score."""

    RISK_CHOICES = [("Low", "Low"), ("Medium", "Medium"), ("High", "High")]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="saved_routes"
    )
    source_label = models.CharField(max_length=200)
    source_lat = models.FloatField()
    source_lon = models.FloatField()
    destination_label = models.CharField(max_length=200)
    destination_lat = models.FloatField()
    destination_lon = models.FloatField()
    distance_km = models.FloatField()
    duration_min = models.IntegerField()
    overall_safety_score = models.FloatField()
    risk_level = models.CharField(max_length=10, choices=RISK_CHOICES)
    geometry = models.JSONField(help_text="GeoJSON LineString from OSRM")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.source_label} -> {self.destination_label} ({self.overall_safety_score})"
