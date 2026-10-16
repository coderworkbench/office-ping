import math
import time

from django.conf import settings
from django.core.cache import cache
from rest_framework import status
from rest_framework.exceptions import Throttled
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView

from apps.audit.utils import record_audit, _client_ip


class SignInLocked(Throttled):
    default_detail = "Too many failed sign-ins."
    extra_detail_singular = "Try again in {wait} second."
    extra_detail_plural = "Try again in {wait} seconds."


def _failures_key(kind, value):
    return f"login_failures:{kind}:{value}"


def _locked_for(key, limit):
    """Seconds left on a lock, or 0. Stored as (count, window_started_at)."""
    count, started = cache.get(key, (0, 0))
    if count < limit:
        return 0
    return max(0, settings.LOGIN_LOCKOUT_SECONDS - (time.time() - started))


def _record_failure(key):
    count, started = cache.get(key, (0, time.time()))
    cache.set(key, (count + 1, started), settings.LOGIN_LOCKOUT_SECONDS)


class LoginView(TokenObtainPairView):
    """JWT sign-in with brute-force protection and an audit trail.

    Only failed attempts count. A username is locked after
    LOGIN_MAX_FAILURES_PER_USER failures, an IP address after
    LOGIN_MAX_FAILURES_PER_IP, until LOGIN_LOCKOUT_SECONDS have passed since
    the first failure. A successful sign-in clears that username's count.
    """

    def post(self, request, *args, **kwargs):
        username = str(request.data.get("username", "")).strip().lower()[:150]
        ip = _client_ip(request) or "unknown"
        user_key = _failures_key("user", username)
        ip_key = _failures_key("ip", ip)

        wait = max(_locked_for(user_key, settings.LOGIN_MAX_FAILURES_PER_USER),
                   _locked_for(ip_key, settings.LOGIN_MAX_FAILURES_PER_IP))
        if wait:
            raise SignInLocked(wait=math.ceil(wait))

        serializer = self.get_serializer(data=request.data)
        try:
            serializer.is_valid(raise_exception=True)  # 401 on bad credentials
        except TokenError as e:
            raise InvalidToken(e.args[0])
        cache.delete(user_key)
        request.user = serializer.user
        record_audit(request, "LOGIN", target=str(serializer.user.id))
        return Response(serializer.validated_data, status=status.HTTP_200_OK)

    def handle_exception(self, exc):
        response = super().handle_exception(exc)
        if response.status_code == status.HTTP_401_UNAUTHORIZED:
            request = self.request
            username = str(request.data.get("username", "")).strip().lower()[:150]
            ip = _client_ip(request) or "unknown"
            _record_failure(_failures_key("user", username))
            _record_failure(_failures_key("ip", ip))
            record_audit(request, "LOGIN_FAILED", target=username[:128],
                         metadata={"username": username})
        return response


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        refresh = request.data.get("refresh")
        if refresh:
            try:
                token = RefreshToken(refresh)
                token.blacklist()
            except Exception:
                pass
        record_audit(request, "LOGOUT", target=str(request.user.id))
        return Response({"detail": "logged out"})
