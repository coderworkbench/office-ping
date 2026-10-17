"""Choosing which templates are quick buttons on the home screen."""
import pytest

from apps.templates.models import MessageTemplate


def _make(n):
    return [MessageTemplate.objects.create(title=f"T{i}", message=f"m{i}") for i in range(n)]


def _toggle(client, t, on=True):
    return client.patch(f"/api/templates/{t.id}/", {"show_on_home": on}, format="json")


@pytest.mark.django_db
def test_up_to_three_templates_on_home(auth, admin_user):
    ts = _make(4)
    c = auth(admin_user)
    for t in ts[:3]:
        assert _toggle(c, t).status_code == 200
    r = _toggle(c, ts[3])
    assert r.status_code == 400
    assert "Only 3 templates fit on the home screen" in str(r.data["show_on_home"])
    # Free a slot, then the fourth fits.
    assert _toggle(c, ts[0], False).status_code == 200
    assert _toggle(c, ts[3]).status_code == 200
    listed = {t["title"]: t["show_on_home"] for t in c.get("/api/templates/").data["results"]}
    assert listed == {"T0": False, "T1": True, "T2": True, "T3": True}


@pytest.mark.django_db
def test_editing_a_home_template_keeps_its_slot(auth, admin_user):
    ts = _make(3)
    c = auth(admin_user)
    for t in ts:
        _toggle(c, t)
    r = c.patch(f"/api/templates/{ts[0].id}/", {"title": "Renamed", "show_on_home": True}, format="json")
    assert r.status_code == 200


@pytest.mark.django_db
def test_deleting_frees_the_slot(auth, hr_user):
    ts = _make(4)
    c = auth(hr_user)                      # HR manages templates too
    for t in ts[:3]:
        _toggle(c, t)
    assert c.delete(f"/api/templates/{ts[0].id}/").status_code == 204
    assert _toggle(c, ts[3]).status_code == 200


@pytest.mark.django_db
def test_members_cannot_choose(auth, member_a):
    (t,) = _make(1)
    assert _toggle(auth(member_a), t).status_code == 403
