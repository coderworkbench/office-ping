from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import ConversationViewSet, unread_total

router = DefaultRouter()
router.register(r"chat/conversations", ConversationViewSet, basename="chat-conversation")

urlpatterns = [
    path("chat/unread/", unread_total),
    path("", include(router.urls)),
]
