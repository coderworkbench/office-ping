from __future__ import annotations

from typing import Optional
import logging

logger = logging.getLogger(__name__)


def _client_ip(request) -> Optional[str]:
    if request is None:
        return None
    # nginx appends the address it saw, so the last entry is the real client;
    # earlier entries come from the browser and can be forged.
    xff = request.META.get("HTTP_X_FORWARDED_FOR")
    if xff:
        return xff.split(",")[-1].strip()
    return request.META.get("REMOTE_ADDR")


def record_audit(request, action: str, *, target: str = "", metadata: dict | None = None):
    """Fire-and-forget audit log; never raises to the caller."""
    try:
        from .models import AuditLog
        AuditLog.objects.create(
            actor=getattr(request, "user", None) if request and getattr(
                request, "user", None
            ) and request.user.is_authenticated else None,
            action=action,
            target=target or "",
            metadata=metadata or {},
            ip_address=_client_ip(request),
        )
    except Exception:
        logger.exception("Failed to record audit log %s", action)
