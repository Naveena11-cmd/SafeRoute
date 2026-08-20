from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import (
    AnalysisView,
    HotspotView,
    IncidentViewSet,
    MeView,
    PlanRouteView,
    PlanRoutesMultiView,
    PredictRouteView,
    PredictView,
    RegisterView,
    SavedRouteViewSet,
)

router = DefaultRouter()
router.register(r"incidents", IncidentViewSet, basename="incident")
router.register(r"routes/history", SavedRouteViewSet, basename="saved-route")

urlpatterns = [
    path("auth/register/", RegisterView.as_view(), name="register"),
    path("auth/me/", MeView.as_view(), name="me"),
    path("routes/plan/", PlanRouteView.as_view(), name="plan-route"),
    path("routes/plan-multi/", PlanRoutesMultiView.as_view(), name="plan-routes-multi"),
    path("analysis/", AnalysisView.as_view(), name="analysis"),
    path("hotspots/", HotspotView.as_view(), name="hotspots"),
    path("predict/", PredictView.as_view(), name="predict"),
    path("predict-route/", PredictRouteView.as_view(), name="predict-route"),
    path("", include(router.urls)),
]
