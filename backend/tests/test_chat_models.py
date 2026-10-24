import pytest
from django.contrib import admin
from django.db import IntegrityError

from apps.audit.models import AuditLog
from apps.chat.models import Conversation, ConversationMember, Message


def test_direct_key_is_the_same_whichever_way_round():
    assert Conversation.key_for(47, 12) == Conversation.key_for(12, 47) == "12:47"


@pytest.mark.django_db
def test_a_pair_can_only_have_one_direct_conversation():
    Conversation.objects.create(direct_key="1:2")
    with pytest.raises(IntegrityError):
        Conversation.objects.create(direct_key="1:2")


@pytest.mark.django_db
def test_a_person_is_a_member_of_a_conversation_once(member_a):
    conv = Conversation.objects.create(direct_key="1:2")
    ConversationMember.objects.create(conversation=conv, user=member_a)
    with pytest.raises(IntegrityError):
        ConversationMember.objects.create(conversation=conv, user=member_a)


def test_audit_log_knows_chat_started():
    assert AuditLog.Action.CHAT_STARTED == "CHAT_STARTED"


def test_message_admin_never_shows_the_text():
    ma = admin.site._registry[Message]
    for attr in ("list_display", "fields", "search_fields", "readonly_fields"):
        assert "body" not in (getattr(ma, attr) or ())


def test_message_admin_is_view_only():
    ma = admin.site._registry[Message]
    assert ma.has_change_permission(None) is False
    assert ma.has_delete_permission(None) is False
    assert ma.has_add_permission(None) is False
