"""manage.py bootstrap: templates from the repo and a first admin."""
import pytest
from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import CommandError

from apps.templates.models import MessageTemplate

User = get_user_model()


@pytest.fixture
def admin_env(monkeypatch):
    monkeypatch.setenv("ADMIN_USERNAME", "boss")
    monkeypatch.setenv("ADMIN_EMAIL", "boss@example.org")
    monkeypatch.setenv("ADMIN_PASSWORD", "Tr0ub4dor-Horse-77")


@pytest.mark.django_db
def test_loads_templates_and_creates_admin(admin_env):
    call_command("bootstrap", "--no-input")
    titles = set(MessageTemplate.objects.filter(is_active=True).values_list("title", flat=True))
    assert "Please come to my desk" in titles and len(titles) == 5
    boss = User.objects.get(username="boss")
    assert boss.role == "ADMIN" and boss.is_superuser and boss.check_password("Tr0ub4dor-Horse-77")


@pytest.mark.django_db
def test_running_again_changes_nothing(admin_env, monkeypatch):
    call_command("bootstrap", "--no-input")
    monkeypatch.setenv("ADMIN_USERNAME", "someone-else")
    call_command("bootstrap", "--no-input")
    assert MessageTemplate.objects.count() == 5
    assert list(User.objects.values_list("username", flat=True)) == ["boss"]


@pytest.mark.django_db
def test_brings_back_a_deleted_template(admin_env):
    call_command("bootstrap", "--templates-only")
    MessageTemplate.objects.filter(title="Please come to my desk").update(is_active=False)
    call_command("bootstrap", "--templates-only")
    assert MessageTemplate.objects.get(title="Please come to my desk").is_active


@pytest.mark.django_db
def test_weak_or_missing_admin_details_are_refused(monkeypatch):
    with pytest.raises(CommandError, match="Set ADMIN_USERNAME"):
        call_command("bootstrap", "--no-input")
    monkeypatch.setenv("ADMIN_USERNAME", "boss")
    monkeypatch.setenv("ADMIN_EMAIL", "boss@example.org")
    monkeypatch.setenv("ADMIN_PASSWORD", "password")
    with pytest.raises(CommandError, match="Password not accepted"):
        call_command("bootstrap", "--no-input")
    assert not User.objects.exists()
