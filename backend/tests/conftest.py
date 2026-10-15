import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

User = get_user_model()


@pytest.fixture
def api_client():
    return APIClient()


def _mk(role, username, **extra):
    return User.objects.create_user(
        username=username,
        email=f"{username}@test.local",
        password="pw-test-1234",
        role=role,
        is_staff=role == "ADMIN",
        is_superuser=role == "ADMIN",
        **extra,
    )


@pytest.fixture
def admin_user(db):
    return _mk("ADMIN", "admin1")


@pytest.fixture
def hr_user(db):
    return _mk("HR", "hr1")


@pytest.fixture
def member_a(db):
    return _mk("MEMBER", "mem_a", first_name="Mem", last_name="A")


@pytest.fixture
def member_b(db):
    return _mk("MEMBER", "mem_b", first_name="Mem", last_name="B")


@pytest.fixture
def auth(api_client):
    def _login(user):
        api_client.force_authenticate(user=user)
        return api_client

    return _login
