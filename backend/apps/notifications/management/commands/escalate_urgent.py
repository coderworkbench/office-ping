import logging
import time

from django.core.management.base import BaseCommand
from django.db import close_old_connections

from apps.notifications.escalation import escalate_due

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Re-alert urgent pings that haven't been acknowledged (see URGENT_ESCALATE_AFTER_MINUTES)."

    def add_arguments(self, parser):
        parser.add_argument("--loop", action="store_true", help="Keep running, checking every --interval seconds.")
        parser.add_argument("--interval", type=int, default=30)

    def handle(self, *args, loop=False, interval=30, **opts):
        while True:
            try:
                close_old_connections()
                n = escalate_due()
                if n:
                    self.stdout.write(f"Escalated {n} urgent ping(s)")
            except Exception:
                # e.g. the database is still starting or migrating; try again.
                logger.exception("Escalation check failed")
            if not loop:
                return
            time.sleep(interval)
