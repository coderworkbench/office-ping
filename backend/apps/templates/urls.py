from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import MessageTemplateViewSet

router = DefaultRouter()
router.register(r"templates", MessageTemplateViewSet, basename="template")

urlpatterns = [path("", include(router.urls))]
