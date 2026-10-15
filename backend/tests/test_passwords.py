import pytest

from apps.audit.models import AuditLog

NEW_PW = "Fresh-Start-2026!"


def reset_url(user):
    return f"/api/users/{user.id}/set-password/"


# ---------- Admin resets another user's password ----------

@pytest.mark.django_db
def test_admin_can_reset_member_password(auth, admin_user, member_a):
    r = auth(admin_user).post(reset_url(member_a), {"new_password": NEW_PW}, format="json")
    assert r.status_code == 200
    member_a.refresh_from_db()
    assert member_a.check_password(NEW_PW)
    assert not member_a.check_password("pw-test-1234")


@pytest.mark.django_db
def test_reset_password_is_audited_without_the_password(auth, admin_user, member_a):
    auth(admin_user).post(reset_url(member_a), {"new_password": NEW_PW}, format="json")
    log = AuditLog.objects.get(action="PASSWORD_RESET")
    assert log.actor == admin_user
    assert log.target == str(member_a.id)
    assert NEW_PW not in str(log.metadata)


@pytest.mark.django_db
def test_hr_cannot_reset_passwords(auth, hr_user, member_a):
    r = auth(hr_user).post(reset_url(member_a), {"new_password": NEW_PW}, format="json")
    assert r.status_code == 403
    member_a.refresh_from_db()
    assert member_a.check_password("pw-test-1234")


@pytest.mark.django_db
def test_member_cannot_reset_passwords(auth, member_a, member_b):
    r = auth(member_a).post(reset_url(member_b), {"new_password": NEW_PW}, format="json")
    assert r.status_code == 403


@pytest.mark.django_db
def test_reset_requires_auth(api_client, member_a):
    r = api_client.post(reset_url(member_a), {"new_password": NEW_PW}, format="json")
    assert r.status_code in (401, 403)


@pytest.mark.django_db
@pytest.mark.parametrize("weak", ["short1!", "12345678", "password"])
def test_reset_rejects_weak_passwords(auth, admin_user, member_a, weak):
    r = auth(admin_user).post(reset_url(member_a), {"new_password": weak}, format="json")
    assert r.status_code == 400
    member_a.refresh_from_db()
    assert member_a.check_password("pw-test-1234")


@pytest.mark.django_db
def test_reset_rejects_password_similar_to_username(auth, admin_user, member_a):
    r = auth(admin_user).post(reset_url(member_a), {"new_password": "mem_a123"}, format="json")
    assert r.status_code == 400


# ---------- Any user changes their own password ----------

@pytest.mark.django_db
def test_user_can_change_own_password(auth, member_a):
    r = auth(member_a).post("/api/me/password/", {
        "current_password": "pw-test-1234", "new_password": NEW_PW,
    }, format="json")
    assert r.status_code == 200
    member_a.refresh_from_db()
    assert member_a.check_password(NEW_PW)
    assert AuditLog.objects.filter(action="PASSWORD_CHANGED",
                                   target=str(member_a.id)).exists()


@pytest.mark.django_db
def test_change_own_password_requires_correct_current(auth, member_a):
    r = auth(member_a).post("/api/me/password/", {
        "current_password": "wrong-one", "new_password": NEW_PW,
    }, format="json")
    assert r.status_code == 400
    member_a.refresh_from_db()
    assert member_a.check_password("pw-test-1234")
