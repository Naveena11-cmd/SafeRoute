from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import Incident, SavedRoute, SafeRouteUser

admin.site.register(SafeRouteUser, UserAdmin)


@admin.register(Incident)
class IncidentAdmin(admin.ModelAdmin):
    list_display = ("incident_type", "severity", "location_label", "source", "created_at")
    list_filter = ("incident_type", "severity", "source")


@admin.register(SavedRoute)
class SavedRouteAdmin(admin.ModelAdmin):
    list_display = ("user", "source_label", "destination_label", "overall_safety_score", "risk_level", "created_at")
    list_filter = ("risk_level",)
