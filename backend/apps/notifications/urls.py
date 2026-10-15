from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import PingViewSet, NotificationCenterViewSet

router = DefaultRouter()
router.register(r"pings", PingViewSet, basename="ping")
router.register(r"notifications", NotificationCenterViewSet,
                basename="notification")

urlpatterns = [path("", include(router.urls))]
