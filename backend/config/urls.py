from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path("django-admin/", admin.site.urls),
    path("api/auth/", include("apps.accounts.urls_auth")),
    path("api/", include("apps.accounts.urls")),
    path("api/", include("apps.groups.urls")),
    path("api/", include("apps.templates.urls")),
    path("api/", include("apps.notifications.urls")),
    path("api/", include("apps.audit.urls")),
    path("api/", include("apps.common.urls")),
]
