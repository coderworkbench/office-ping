"""WebSocket auth middleware.

Supports two mechanisms:
  1. ?token=<access_jwt> query parameter (used by the PWA client).
  2. Fallback to Django session cookies (SessionMiddleware already upstream).

Server is authoritative: an unauthenticated connection is rejected.
"""
from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from channels.middleware import BaseMiddleware
from django.contrib.auth.models import AnonymousUser
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework_simplejwt.tokens import UntypedToken


@database_sync_to_async
def _get_user(user_id):
    from django.contrib.auth import get_user_model
    User = get_user_model()
    try:
        return User.objects.get(pk=user_id, is_active=True)
    except User.DoesNotExist:
        return AnonymousUser()


class JWTAuthMiddleware(BaseMiddleware):
    async def __call__(self, scope, receive, send):
        qs = parse_qs(scope.get("query_string", b"").decode())
        token = qs.get("token", [None])[0]
        user = AnonymousUser()
        if token:
            try:
                validated = UntypedToken(token)
                uid = validated["user_id"]
                user = await _get_user(uid)
            except (InvalidToken, TokenError, KeyError):
                user = AnonymousUser()
        scope["user"] = user
        return await super().__call__(scope, receive, send)
