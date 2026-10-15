from django.utils.deprecation import MiddlewareMixin


class AuditMiddleware(MiddlewareMixin):
    """Thin middleware: attaches request to a thread-local so record_audit works
    even from signals. Minimal to avoid overhead on hot paths.
    """

    def process_request(self, request):
        # Normalize X-Forwarded-For (nginx) into REMOTE_ADDR if missing
        if not request.META.get("REMOTE_ADDR") and request.META.get("HTTP_X_FORWARDED_FOR"):
            request.META["REMOTE_ADDR"] = request.META[
                "HTTP_X_FORWARDED_FOR"
            ].split(",")[0].strip()
