import pytest


@pytest.mark.django_db
def test_me_requires_auth(api_client):
    r = api_client.get("/api/me/")
    assert r.status_code in (401, 403)


@pytest.mark.django_db
def test_me_returns_profile(auth, member_a):
    client = auth(member_a)
    r = client.get("/api/me/")
    assert r.status_code == 200
    assert r.data["username"] == "mem_a"
    assert r.data["role"] == "MEMBER"


@pytest.mark.django_db
def test_only_admin_can_create_users(auth, hr_user, admin_user):
    hr = auth(hr_user)
    r = hr.post("/api/users/", {
        "username": "new1", "email": "new1@test.local",
        "password": "StrongPw9!xx", "role": "MEMBER",
    }, format="json")
    assert r.status_code == 403

    adm = auth(admin_user)
    r = adm.post("/api/users/", {
        "username": "new1", "email": "new1@test.local",
        "password": "StrongPw9!xx", "role": "MEMBER",
    }, format="json")
    assert r.status_code == 201
