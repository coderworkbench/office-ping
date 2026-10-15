"""Seed demo data for local development.

Creates admin/HR/members, a few groups, and standard templates.
Dev-only credentials.
"""
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

from apps.groups.models import Group, GroupMember
from apps.templates.models import MessageTemplate

User = get_user_model()

DEMO_USERS = [
    ("admin", "admin@example.local", "Admin", "User", "ADMIN", "IT"),
    ("hr", "hr@example.local", "HR", "Lead", "HR", "People"),
    ("mangesh", "mangesh@example.local", "Mangesh", "P", "MEMBER", "Backend"),
    ("rahul", "rahul@example.local", "Rahul", "D", "MEMBER", "Backend"),
    ("sneha", "sneha@example.local", "Sneha", "K", "MEMBER", "Frontend"),
    ("amit", "amit@example.local", "Amit", "V", "MEMBER", "Frontend"),
]

DEMO_PASSWORD = "ChangeMe123!"

DEMO_GROUPS = {
    "Backend Team": ["mangesh", "rahul"],
    "Frontend Team": ["sneha", "amit"],
    "HR Team": ["hr"],
}

DEMO_TEMPLATES = [
    ("Please come here", "Please come here"),
    ("Please contact HR", "Please contact HR"),
    ("Please come to the meeting room", "Please come to the meeting room"),
    ("Please join the meeting", "Please join the meeting"),
    ("Please be silent", "Please be silent"),
    ("Please see me when available", "Please see me when available"),
]


class Command(BaseCommand):
    help = "Seed demo data (dev-only)."

    def handle(self, *args, **options):
        users_by_username = {}
        for username, email, first, last, role, dept in DEMO_USERS:
            user, created = User.objects.get_or_create(
                username=username,
                defaults={
                    "email": email,
                    "first_name": first,
                    "last_name": last,
                    "role": role,
                    "department": dept,
                    "is_staff": role == "ADMIN",
                    "is_superuser": role == "ADMIN",
                    "is_active": True,
                },
            )
            if created or not user.has_usable_password():
                user.set_password(DEMO_PASSWORD)
                user.save()
            users_by_username[username] = user
            self.stdout.write(f"User: {username} ({role})")

        creator = users_by_username["admin"]
        for gname, members in DEMO_GROUPS.items():
            g, _ = Group.objects.get_or_create(
                name=gname, defaults={"created_by": creator, "is_active": True}
            )
            for u in members:
                GroupMember.objects.get_or_create(group=g, user=users_by_username[u])
            self.stdout.write(f"Group: {gname} ({len(members)} members)")

        for title, body in DEMO_TEMPLATES:
            MessageTemplate.objects.get_or_create(
                title=title,
                defaults={"message": body, "created_by": creator, "is_active": True},
            )
        self.stdout.write(self.style.SUCCESS("Seed complete."))
        self.stdout.write(
            self.style.WARNING(
                f"Demo password for all users: {DEMO_PASSWORD} (dev-only)"
            )
        )
