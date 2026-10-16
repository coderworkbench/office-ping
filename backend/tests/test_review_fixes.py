"""Dashboard numbers, the people list, History filters and export, and
sign-in protection."""
import csv
import io
from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.audit.models import AuditLog
from apps.notifications.models import Ping
from tests.conftest import _mk


def _send(client, recipient, message):
    r = client.post("/api/pings/", {"recipient": recipient.id, "message": message},
                    format="json")
    assert r.status_code == 201, r.data
    return Ping.objects.get(pk=r.data["id"])


# ---------- Dashboard ----------

@pytest.mark.django_db
def test_dashboard_counts_teammates_without_you(auth, admin_user, member_a, member_b):
    member_a.last_seen_at = timezone.now()
    member_a.save()
    admin_user.last_seen_at = timezone.now()
    admin_user.save()
    _mk("MEMBER", "gone", is_active=False)
    d = auth(admin_user).get("/api/dashboard/").data
    assert d["total_employees"] == 2          # member_a, member_b
    assert d["online_employees"] == 1         # member_a; you're not counted
    assert d["offline_employees"] == 1


@pytest.mark.django_db
def test_dashboard_today_starts_at_local_midnight(auth, admin_user, member_a, member_b, settings):
    settings.TIME_ZONE = "Asia/Kolkata"
    timezone.activate("Asia/Kolkata")
    try:
        p = _send(auth(member_a), member_b, "today")
        old = _send(auth(member_a), member_b, "yesterday")
        midnight = timezone.localtime().replace(hour=0, minute=0, second=0, microsecond=0)
        Ping.objects.filter(pk=old.pk).update(created_at=midnight - timedelta(minutes=1))
        Ping.objects.filter(pk=p.pk).update(created_at=midnight + timedelta(minutes=1))
        assert auth(admin_user).get("/api/dashboard/").data["pings_today"] == 1
    finally:
        timezone.deactivate()


@pytest.mark.django_db
def test_awaiting_ack_card_matches_history_filter(auth, admin_user, member_a, member_b):
    c = auth(member_a)
    _send(c, member_b, "one")
    acked = _send(c, member_b, "two")
    old = _send(auth(member_b), member_a, "old")
    auth(member_b).post(f"/api/pings/{acked.id}/acknowledge/")
    Ping.objects.filter(pk=old.pk).update(created_at=timezone.now() - timedelta(days=2))

    a = auth(admin_user)
    card = a.get("/api/dashboard/").data["pending_acknowledgements"]
    listed = a.get("/api/pings/?scope=all&awaiting=1").data
    assert card == listed["count"] == 1
    assert listed["results"][0]["message"] == "one"


# ---------- People list ----------

@pytest.mark.django_db
def test_people_list_is_everyone_active_unpaginated(auth, admin_user, member_a):
    for i in range(30):
        _mk("MEMBER", f"user{i}")
    _mk("MEMBER", "gone", is_active=False)
    for viewer in (admin_user, member_a):
        r = auth(viewer).get("/api/users/")
        assert isinstance(r.data, list)
        names = {u["username"] for u in r.data}
        assert len(names) == 32 and "gone" not in names


@pytest.mark.django_db
def test_admin_users_page_can_include_deactivated(auth, admin_user, member_a):
    _mk("MEMBER", "gone", is_active=False)
    names = {u["username"] for u in auth(admin_user).get("/api/users/?include_inactive=1").data}
    assert "gone" in names
    names = {u["username"] for u in auth(member_a).get("/api/users/?include_inactive=1").data}
    assert "gone" not in names


# ---------- History filters and export ----------

@pytest.mark.django_db
def test_history_filters(auth, admin_user, hr_user, member_a, member_b):
    a_to_b = _send(auth(member_a), member_b, "coffee?")
    urgent = auth(hr_user).post("/api/pings/", {"recipient": member_a.id, "message": "fire drill",
                                                "priority": "URGENT"}, format="json").data["id"]
    old = _send(auth(member_b), hr_user, "last week")
    Ping.objects.filter(pk=old.pk).update(created_at=timezone.now() - timedelta(days=7))

    c = auth(admin_user)
    ids = lambda q: [p["id"] for p in c.get("/api/pings/?scope=all&" + q).data["results"]]
    assert ids(f"person={member_b.id}") == [a_to_b.id, old.id]
    assert ids("priority=URGENT") == [urgent]
    assert set(ids("search=Mem B")) == {a_to_b.id, old.id}   # by name
    assert set(ids("search=coffee")) == {a_to_b.id}
    today = timezone.localdate().isoformat()
    assert set(ids(f"since={today}")) == {a_to_b.id, urgent}
    week_ago = (timezone.localdate() - timedelta(days=7)).isoformat()
    assert ids(f"since={week_ago}&until={week_ago}") == [old.id]
    assert ids("since=not-a-date") != []           # bad dates are ignored


@pytest.mark.django_db
def test_members_filters_stay_within_their_own_pings(auth, hr_user, member_a, member_b):
    _send(auth(hr_user), member_b, "private")
    r = auth(member_a).get(f"/api/pings/?scope=all&person={member_b.id}")
    assert r.data["count"] == 0


@pytest.mark.django_db
def test_csv_export_is_admin_only_and_audited(auth, admin_user, hr_user, member_a, member_b):
    _send(auth(member_a), member_b, "=HYPERLINK(\"http://x\")")
    for u in (hr_user, member_a):
        assert auth(u).get("/api/pings/export/?scope=all").status_code == 403

    r = auth(admin_user).get("/api/pings/export/?scope=all")
    assert r.status_code == 200
    assert r["Content-Type"].startswith("text/csv")
    rows = list(csv.reader(io.StringIO(r.content.decode("utf-8-sig"))))
    assert rows[0][:3] == ["Sent at", "From", "To"]
    assert rows[1][1:3] == ["Mem A", "Mem B"]
    assert rows[1][4].startswith("'=")             # not run as a formula
    log = AuditLog.objects.get(action="PINGS_EXPORTED")
    assert log.actor == admin_user and log.metadata["rows"] == 1


# ---------- Sign-in ----------

def _login(username, password, ip="203.0.113.5"):
    return APIClient().post("/api/auth/login/", {"username": username, "password": password},
                            format="json", HTTP_X_FORWARDED_FOR=f"10.9.9.9, {ip}")


@pytest.mark.django_db
def test_sign_ins_are_audited(member_a):
    assert _login("mem_a", "pw-test-1234").status_code == 200
    assert _login("mem_a", "wrong").status_code == 401
    ok = AuditLog.objects.get(action="LOGIN")
    assert ok.actor == member_a and ok.ip_address == "203.0.113.5"
    bad = AuditLog.objects.get(action="LOGIN_FAILED")
    assert bad.actor is None and bad.target == "mem_a"


@pytest.mark.django_db
def test_username_locks_after_five_failures(member_a, member_b):
    for i in range(5):
        assert _login("mem_a", "wrong", ip=f"203.0.113.{i}").status_code == 401
    r = _login("mem_a", "pw-test-1234", ip="203.0.113.99")   # even the right password
    assert r.status_code == 429
    assert r.data["detail"].startswith("Too many failed sign-ins. Try again in ")
    assert int(r["Retry-After"]) > 800
    assert _login("mem_b", "pw-test-1234", ip="203.0.113.99").status_code == 200


@pytest.mark.django_db
def test_ip_locks_after_twenty_failures(member_a):
    for i in range(20):
        assert _login(f"nobody{i}", "wrong").status_code == 401
    assert _login("mem_a", "pw-test-1234").status_code == 429
    assert _login("mem_a", "pw-test-1234", ip="198.51.100.7").status_code == 200


@pytest.mark.django_db
def test_successful_sign_in_resets_the_count(member_a):
    for _ in range(4):
        _login("mem_a", "wrong")
    assert _login("mem_a", "pw-test-1234").status_code == 200
    for _ in range(4):
        assert _login("mem_a", "wrong").status_code == 401
    assert _login("mem_a", "pw-test-1234").status_code == 200


@pytest.mark.django_db
def test_lock_expires(member_a, settings):
    settings.LOGIN_LOCKOUT_SECONDS = 1
    for _ in range(5):
        _login("mem_a", "wrong")
    assert _login("mem_a", "pw-test-1234").status_code == 429
    import time
    time.sleep(1.1)
    assert _login("mem_a", "pw-test-1234").status_code == 200
