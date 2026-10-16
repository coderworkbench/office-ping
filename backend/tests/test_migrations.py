import pytest
from django.core.management import call_command


@pytest.mark.django_db
def test_models_and_committed_migrations_match():
    # Migrations are committed, not generated at start-up: a model change
    # without its migration would never reach the production database.
    call_command("makemigrations", "--check", "--dry-run", verbosity=0)
