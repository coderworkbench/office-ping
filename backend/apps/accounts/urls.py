from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import UserViewSet, DeviceViewSet, PasswordChangeView, MyStatusView

router = DefaultRouter()
router.register(r"users", UserViewSet, basename="user")
router.register(r"devices", DeviceViewSet, basename="device")

urlpatterns = [
    path("", include(router.urls)),
    path("me/password/", PasswordChangeView.as_view(), name="password-change"),
    path("me/status/", MyStatusView.as_view(), name="my-status"),
    path("me/", UserViewSet.as_view({"get": "me"}), name="me"),
]
