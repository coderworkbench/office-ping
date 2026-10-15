import pytest
from apps.groups.models import Group


@pytest.mark.django_db
def test_member_cannot_create_group(auth, member_a):
    c = auth(member_a)
    r = c.post("/api/groups/", {"name": "X"}, format="json")
    assert r.status_code == 403


@pytest.mark.django_db
def test_hr_creates_group_and_adds_member(auth, hr_user, member_a):
    c = auth(hr_user)
    r = c.post("/api/groups/", {"name": "Backend Team"}, format="json")
    assert r.status_code == 201
    gid = r.data["id"]
    r2 = c.post(f"/api/groups/{gid}/members/", {"user_id": member_a.id},
                format="json")
    assert r2.status_code in (200, 201)
    g = Group.objects.get(pk=gid)
    assert g.memberships.filter(user=member_a).exists()


@pytest.mark.django_db
def test_only_hr_or_admin_can_write_templates(auth, member_a, hr_user):
    cm = auth(member_a)
    r = cm.post("/api/templates/", {"title": "T", "message": "M"},
                format="json")
    assert r.status_code == 403
    ch = auth(hr_user)
    r2 = ch.post("/api/templates/", {"title": "T", "message": "M"},
                 format="json")
    assert r2.status_code == 201
