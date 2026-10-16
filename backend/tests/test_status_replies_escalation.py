"""Status / do-not-disturb, quick replies, and urgent escalation."""
from datetime import timedelta

import pytest
from django.utils import timezone

from apps.audit.models import AuditLog
from apps.notifications.consumers import pending_notifications
from apps.notifications.escalation import escalate_due
from apps.notifications.models import Ping, PingDelivery


def _send(client, recipient, message="hi", priority="NORMAL"):
    r = client.post("/api/pings/", {"recipient": recipient.id, "message": message,
                                    "priority": priority}, format="json")
    assert r.status_code == 201, r.data
    return r.data["id"]


def _set_status(client, kind, until=None, text=""):
    return client.put("/api/me/status/", {"kind": kind, "text": text,
                                          "until": until.isoformat() if until else None},
                      format="json")


# ---------- Status ----------

@pytest.mark.django_db
def test_set_and_clear_status(auth, member_a, member_b):
    until = timezone.now() + timedelta(hours=1)
    r = _set_status(auth(member_a), "MEETING", until, "Board review")
    assert r.status_code == 200
    assert r.data["status"]["label"] == "In a meeting"
    assert r.data["status"]["text"] == "Board review"
    assert r.data["status"]["quiet"] is True

    others = {u["username"]: u for u in auth(member_b).get("/api/users/").data}
    assert others["mem_a"]["status"]["kind"] == "MEETING"

    r = _set_status(auth(member_a), "")
    assert r.data["status"] is None


@pytest.mark.django_db
def test_status_ends_on_its_own(member_a):
    member_a.status_kind = "DND"
    member_a.status_until = timezone.now() - timedelta(seconds=1)
    member_a.save()
    assert member_a.current_status() is None
    assert member_a.wants_quiet is False


@pytest.mark.django_db
def test_status_time_must_be_sensible(auth, member_a):
    c = auth(member_a)
    assert _set_status(c, "LUNCH", timezone.now() - timedelta(minutes=1)).status_code == 400
    assert _set_status(c, "LUNCH", timezone.now() + timedelta(days=8)).status_code == 400
    assert _set_status(c, "SLEEPING").status_code == 400
    assert _set_status(c, "AWAY").status_code == 200        # no end time is fine


@pytest.mark.django_db
@pytest.mark.parametrize("kind,quiet", [("MEETING", True), ("DND", True),
                                        ("LUNCH", False), ("AWAY", False), ("", False)])
def test_meeting_and_dnd_make_normal_pings_quiet(auth, member_a, member_b, kind, quiet):
    _set_status(auth(member_b), kind, timezone.now() + timedelta(hours=1))
    _send(auth(member_a), member_b, "normal")
    (p,) = pending_notifications(member_b.id)
    assert p["quiet"] is quiet


@pytest.mark.django_db
def test_urgent_pings_always_break_through(auth, member_a, member_b):
    _set_status(auth(member_b), "DND", timezone.now() + timedelta(hours=1))
    _send(auth(member_a), member_b, "fire!", priority="URGENT")
    (p,) = pending_notifications(member_b.id)
    assert p["quiet"] is False and p["reminder"] is False


# ---------- Quick replies ----------

@pytest.mark.django_db
def test_acknowledge_with_a_reply(auth, member_a, member_b):
    pid = _send(auth(member_a), member_b, "Please come to my desk")
    r = auth(member_b).post(f"/api/pings/{pid}/acknowledge/", {"reply": "  On my   way "},
                            format="json")
    assert r.status_code == 200
    assert r.data["deliveries"][0]["reply"] == "On my way"
    feed = auth(member_b).get("/api/notifications/").data["results"]
    assert feed[0]["reply"] == "On my way"
    log = AuditLog.objects.get(action="PING_ACKNOWLEDGED")
    assert log.metadata == {"reply": "On my way"}


@pytest.mark.django_db
def test_reply_is_optional_and_limited(auth, member_a, member_b):
    pid = _send(auth(member_a), member_b)
    c = auth(member_b)
    assert c.post(f"/api/pings/{pid}/acknowledge/", {"reply": "x" * 121},
                  format="json").status_code == 400
    assert c.post(f"/api/pings/{pid}/acknowledge/").status_code == 200
    assert PingDelivery.objects.get(ping_id=pid).reply == ""


# ---------- Urgent escalation ----------

def _age(ping_id, minutes):
    then = timezone.now() - timedelta(minutes=minutes)
    Ping.objects.filter(pk=ping_id).update(created_at=then)
    PingDelivery.objects.filter(ping_id=ping_id).update(created_at=then)


@pytest.mark.django_db
def test_unacknowledged_urgent_ping_is_escalated_once(auth, member_a, member_b, settings):
    settings.URGENT_ESCALATE_AFTER_MINUTES = 5
    pid = _send(auth(member_a), member_b, "Server down", priority="URGENT")
    _age(pid, 4)
    assert escalate_due() == 0                 # not yet
    _age(pid, 6)
    assert escalate_due() == 1
    assert escalate_due() == 0                 # only once
    d = PingDelivery.objects.get(ping_id=pid)
    assert d.escalated_at is not None
    log = AuditLog.objects.get(action="PING_ESCALATED")
    assert log.target == str(pid) and log.metadata["recipient"] == "mem_b"


@pytest.mark.django_db
def test_escalation_skips_normal_acknowledged_and_old_pings(auth, member_a, member_b, settings):
    settings.URGENT_ESCALATE_AFTER_MINUTES = 5
    normal = _send(auth(member_a), member_b, "normal")
    acked = _send(auth(member_a), member_b, "urgent acked", priority="URGENT")
    auth(member_b).post(f"/api/pings/{acked}/acknowledge/")
    old = _send(auth(member_b), member_a, "urgent old", priority="URGENT")
    for pid, mins in ((normal, 10), (acked, 10), (old, 60 * 25)):
        _age(pid, mins)
    assert escalate_due() == 0


@pytest.mark.django_db
def test_escalation_can_be_turned_off(auth, member_a, member_b, settings):
    settings.URGENT_ESCALATE_AFTER_MINUTES = 0
    pid = _send(auth(member_a), member_b, "x", priority="URGENT")
    _age(pid, 60)
    assert escalate_due() == 0


@pytest.mark.django_db
def test_escalate_command_runs_once(auth, member_a, member_b, settings, capsys):
    from django.core.management import call_command
    settings.URGENT_ESCALATE_AFTER_MINUTES = 5
    pid = _send(auth(member_a), member_b, "x", priority="URGENT")
    _age(pid, 6)
    call_command("escalate_urgent")
    assert "Escalated 1 urgent ping(s)" in capsys.readouterr().out
