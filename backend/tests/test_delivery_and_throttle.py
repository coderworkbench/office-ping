from datetime import timedelta

import pytest
from django.utils import timezone

from apps.notifications.consumers import pending_notifications
from apps.notifications.models import PingDelivery


def _ping(client, recipient, message="hi"):
    r = client.post("/api/pings/", {"recipient": recipient.id, "message": message},
                    format="json")
    assert r.status_code == 201, r.data
    return r.data["id"]


# ---------- What gets re-sent when a recipient's browser (re)connects ----------

@pytest.mark.django_db
def test_reconnect_resends_pings_that_never_reached_the_browser(auth, member_a, member_b):
    ping_id = _ping(auth(member_a), member_b, "sent while you were away")
    pending = pending_notifications(member_b.id)
    assert [p["ping_id"] for p in pending] == [ping_id]
    assert pending[0]["message"] == "sent while you were away"


@pytest.mark.django_db
def test_reconnect_does_not_resend_delivered_pings(auth, member_a, member_b):
    # Delivered but not acknowledged (e.g. the user picked "Later"): it lives in
    # the inbox now and must not pop up again on every reload.
    ping_id = _ping(auth(member_a), member_b)
    PingDelivery.objects.filter(ping_id=ping_id).update(
        delivered_at=timezone.now(), status=PingDelivery.Status.DELIVERED)
    assert pending_notifications(member_b.id) == []


@pytest.mark.django_db
def test_reconnect_does_not_resend_acknowledged_or_old_pings(auth, member_a, member_b):
    c = auth(member_a)
    acked = _ping(c, member_b, "acked")
    PingDelivery.objects.filter(ping_id=acked).update(acknowledged_at=timezone.now())
    old = _ping(c, member_b, "old")
    PingDelivery.objects.filter(ping_id=old).update(
        created_at=timezone.now() - timedelta(days=2))
    assert pending_notifications(member_b.id) == []


@pytest.mark.django_db
def test_reconnect_only_returns_own_pings(auth, member_a, member_b):
    _ping(auth(member_a), member_b)
    assert pending_notifications(member_a.id) == []


# ---------- Rate limit applies to sending, not to reading ----------

@pytest.mark.django_db
def test_listing_pings_is_not_rate_limited(auth, member_a):
    c = auth(member_a)
    codes = [c.get("/api/pings/?scope=sent").status_code for _ in range(15)]
    assert codes == [200] * 15


@pytest.mark.django_db
@pytest.mark.parametrize("role", ["member", "hr", "admin"])
def test_everyone_can_send_five_pings_a_minute(role, auth, member_a, member_b,
                                               hr_user, admin_user, settings):
    settings.PING_RATE_PER_RECIPIENT = "100/minute"   # isolate the overall limit
    sender = {"member": member_a, "hr": hr_user, "admin": admin_user}[role]
    c = auth(sender)
    codes = [
        c.post("/api/pings/", {"recipient": member_b.id, "message": f"hi {i}"},
               format="json").status_code
        for i in range(6)
    ]
    assert codes == [201] * 5 + [429]


@pytest.mark.django_db
def test_rate_limit_says_how_long_to_wait(auth, member_a, member_b, settings):
    settings.PING_RATE_PER_RECIPIENT = "100/minute"
    c = auth(member_a)
    for i in range(5):
        _ping(c, member_b, f"hi {i}")
    r = c.post("/api/pings/", {"recipient": member_b.id, "message": "hi"},
               format="json")
    assert r.status_code == 429
    assert r.data["detail"].startswith("You can send 5 pings a minute. Try again in ")
    assert int(r["Retry-After"]) > 0


# ---------- One person can't bombard another ----------

def _send(client, recipient, message):
    return client.post("/api/pings/", {"recipient": recipient.id, "message": message},
                       format="json")


@pytest.mark.django_db
def test_same_message_to_same_person_is_refused(auth, member_a, member_b):
    c = auth(member_a)
    _ping(c, member_b, "Please come to my desk")
    r = _send(c, member_b, "  Please come to my desk ")
    assert r.status_code == 429
    name = member_b.get_full_name() or member_b.username
    assert r.data["detail"].startswith(
        f"You just sent {name} this same message. Try again in ")
    assert 0 < int(r["Retry-After"]) <= 60


@pytest.mark.django_db
def test_at_most_two_pings_a_minute_to_the_same_person(auth, member_a, member_b, hr_user):
    c = auth(member_a)
    _ping(c, member_b, "one")
    _ping(c, member_b, "two")
    r = _send(c, member_b, "three")
    assert r.status_code == 429
    name = member_b.get_full_name() or member_b.username
    assert r.data["detail"].startswith(
        f"You've already pinged {name} twice in the last minute. Try again in ")
    # Other people can still be pinged, and others can still ping member_b.
    assert _send(c, hr_user, "three").status_code == 201
    assert _send(auth(hr_user), member_b, "one").status_code == 201


@pytest.mark.django_db
def test_per_person_limit_applies_to_hr_and_admins_too(auth, admin_user, member_b):
    c = auth(admin_user)
    _ping(c, member_b, "one")
    _ping(c, member_b, "two")
    assert _send(c, member_b, "three").status_code == 429


@pytest.mark.django_db
def test_per_person_limit_resets_after_a_minute(auth, member_a, member_b):
    from apps.notifications.models import Ping
    c = auth(member_a)
    _ping(c, member_b, "hi")
    _ping(c, member_b, "again")
    Ping.objects.update(created_at=timezone.now() - timedelta(seconds=61))
    assert _send(c, member_b, "hi").status_code == 201


@pytest.mark.django_db
def test_blocked_attempts_are_audited_once_a_minute(auth, member_a, member_b):
    from apps.audit.models import AuditLog
    c = auth(member_a)
    _ping(c, member_b, "hi")
    for _ in range(3):
        assert _send(c, member_b, "hi").status_code == 429
    logs = AuditLog.objects.filter(action="PING_BLOCKED")
    assert logs.count() == 1
    log = logs.get()
    assert log.actor == member_a
    assert log.target == str(member_b.id)
    assert log.metadata == {"reason": "duplicate", "recipient": member_b.username}
