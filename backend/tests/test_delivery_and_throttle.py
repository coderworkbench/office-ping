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
def test_sending_pings_is_still_rate_limited(auth, member_a, member_b):
    c = auth(member_a)
    codes = [
        c.post("/api/pings/", {"recipient": member_b.id, "message": "hi"},
               format="json").status_code
        for _ in range(12)
    ]
    assert codes[:10] == [201] * 10   # members: 10/minute
    assert 429 in codes[10:]
