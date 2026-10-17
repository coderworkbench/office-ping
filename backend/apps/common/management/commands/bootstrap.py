"""Set up a fresh Office Ping without a backup: the message templates kept in
the repo (initial_data/templates.json) and a first admin account.

    python manage.py bootstrap                 # asks for the admin's details
    ADMIN_USERNAME=… ADMIN_EMAIL=… ADMIN_PASSWORD=… python manage.py bootstrap --no-input

Safe to run again: templates are matched by title and updated, and no admin
is created if an active one already exists. To get everything back (users,
passwords, groups, history), restore a backup instead: scripts/restore.sh.
"""
import getpass
import json
import os
from pathlib import Path

from django.conf import settings
from django.contrib.auth import get_user_model, password_validation
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.templates.models import HOME_TEMPLATES_MAX, MessageTemplate

TEMPLATES_FILE = Path(settings.BASE_DIR) / "initial_data" / "templates.json"


class Command(BaseCommand):
    help = "Load the repo's message templates and create the first admin (for a fresh install without a backup)."

    def add_arguments(self, parser):
        parser.add_argument("--no-input", action="store_true",
                            help="Take the admin from ADMIN_USERNAME / ADMIN_EMAIL / ADMIN_PASSWORD instead of asking.")
        parser.add_argument("--templates-only", action="store_true", help="Only load the templates.")

    def handle(self, *args, no_input=False, templates_only=False, **opts):
        self.load_templates()
        if not templates_only:
            self.create_admin(no_input)

    @transaction.atomic
    def load_templates(self):
        items = json.loads(TEMPLATES_FILE.read_text(encoding="utf-8"))
        created = updated = 0
        for item in items:
            t, new = MessageTemplate.objects.get_or_create(
                title=item["title"], defaults={"message": item["message"]})
            t.message = item["message"]
            t.is_active = True
            t.save(update_fields=["message", "is_active"])
            created += new
            updated += not new
        # Home-screen choices from the file, within the limit of three.
        wanted = [i["title"] for i in items if i.get("show_on_home")][:HOME_TEMPLATES_MAX]
        if wanted:
            MessageTemplate.objects.update(show_on_home=False)
            MessageTemplate.objects.filter(title__in=wanted).update(show_on_home=True)
        self.stdout.write(f"Templates: {created} added, {updated} already there.")

    def create_admin(self, no_input):
        User = get_user_model()
        existing = User.objects.filter(role="ADMIN", is_active=True).first()
        if existing:
            self.stdout.write(f"Admin: '{existing.username}' already exists, so none was created.")
            return

        first_name = ""
        if no_input:
            first_name = os.environ.get("ADMIN_FIRST_NAME", "").strip()
            username = os.environ.get("ADMIN_USERNAME", "").strip()
            email = os.environ.get("ADMIN_EMAIL", "").strip()
            password = os.environ.get("ADMIN_PASSWORD", "")
            if not (username and email and password):
                raise CommandError("Set ADMIN_USERNAME, ADMIN_EMAIL and ADMIN_PASSWORD, or run without --no-input.")
        else:
            self.stdout.write("Create the first admin account.")
            username = input("Username: ").strip()
            email = input("Email: ").strip()
            first_name = input("First name (optional): ").strip()
            while True:
                password = getpass.getpass("Password (8+ characters): ")
                if password != getpass.getpass("Password again: "):
                    self.stderr.write("The passwords don't match. Try again.")
                    continue
                break

        user = User(username=username, email=email, first_name=first_name,
                    role="ADMIN", is_staff=True, is_superuser=True)
        try:
            password_validation.validate_password(password, user)
        except ValidationError as e:
            raise CommandError("Password not accepted: " + " ".join(e.messages))
        user.set_password(password)
        user.save()
        self.stdout.write(self.style.SUCCESS(f"Admin: '{username}' created. You can sign in now."))
