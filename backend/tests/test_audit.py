import pytest
from apps.audit.models import AuditLog


@pytest.mark.django_db
def test_ping_sent_creates_audit_log(auth, member_a, member_b):
    c = auth(member_a)
    r = c.post("/api/pings/", {
        "recipient": member_b.id, "message": "x",
    }, format="json")
    assert r.status_code == 201
    assert AuditLog.objects.filter(
        action="PING_SENT", actor=member_a, target=str(r.data["id"])
    ).exists()


@pytest.mark.django_db
def test_only_admin_can_read_audit_logs(auth, admin_user, hr_user, member_a):
    for u in (hr_user, member_a):
        c = auth(u)
        assert c.get("/api/audit-logs/").status_code == 403
    c = auth(admin_user)
    assert c.get("/api/audit-logs/").status_code == 200
