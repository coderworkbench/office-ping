"""Chat queries and writes, shared by the REST views and the socket consumer."""
from django.db import transaction
from django.db.models import BigIntegerField, Count, F, IntegerField, OuterRef, Q, Subquery, Value
from django.db.models.functions import Coalesce

from .models import Conversation, ConversationMember, Message
from .serializers import PREVIEW, message_dict, person_dict


def open_direct(me, other):
    """The one conversation between two people, created on first use.
    Returns (conversation, created)."""
    with transaction.atomic():
        conv, created = Conversation.objects.get_or_create(
            direct_key=Conversation.key_for(me.id, other.id),
            defaults={"kind": Conversation.Kind.DIRECT},
        )
        if created:
            ConversationMember.objects.bulk_create([
                ConversationMember(conversation=conv, user=me),
                ConversationMember(conversation=conv, user=other),
            ])
    return conv, created


def _unread(user):
    """Per membership: messages from others after the member's read marker."""
    after_marker = Coalesce(OuterRef("last_read_message_id"), Value(0),
                            output_field=BigIntegerField())
    counts = (Message.objects
              .filter(conversation=OuterRef("conversation"), id__gt=after_marker)
              .exclude(sender_id=user.id)
              .order_by().values("conversation").annotate(n=Count("id")).values("n"))
    return Coalesce(Subquery(counts, output_field=IntegerField()), Value(0),
                    output_field=IntegerField())


def _memberships(user):
    newest = Message.objects.filter(conversation=OuterRef("conversation")).order_by("-id").values("id")[:1]
    return (ConversationMember.objects.filter(user=user)
            .select_related("conversation")
            .annotate(unread=_unread(user), last_id=Subquery(newest)))


def summaries(user, conversation_id=None):
    """The caller's chats for the chat list, most recent activity first."""
    mine = _memberships(user).order_by(
        F("conversation__last_message_at").desc(nulls_last=True), "-conversation_id")
    if conversation_id is not None:
        mine = mine.filter(conversation_id=conversation_id)
    mine = list(mine)
    ids = [m.conversation_id for m in mine]
    others = {o.conversation_id: o for o in ConversationMember.objects
              .filter(conversation_id__in=ids).exclude(user=user).select_related("user")}
    lasts = Message.objects.in_bulk([m.last_id for m in mine if m.last_id])
    rows = []
    for m in mine:
        other = others.get(m.conversation_id)
        if other is None:  # the other person was deleted outright
            continue
        last = lasts.get(m.last_id)
        at = m.conversation.last_message_at
        rows.append({
            "id": m.conversation_id,
            "other": person_dict(other.user),
            "last_message": last and {**message_dict(last), "body": last.body[:PREVIEW]},
            "last_message_at": at and at.isoformat(),
            "unread": m.unread,
            "muted": m.muted,
            "other_last_read_id": other.last_read_message_id,
        })
    return rows


def unread_total(user) -> int:
    return sum(_memberships(user).values_list("unread", flat=True))


def send_message(member, body):
    """Store a message; the sender has read everything up to it."""
    with transaction.atomic():
        msg = Message.objects.create(conversation_id=member.conversation_id,
                                     sender_id=member.user_id, body=body)
        Conversation.objects.filter(pk=member.conversation_id).update(last_message_at=msg.created_at)
        ConversationMember.objects.filter(pk=member.pk).update(last_read_message=msg)
    return msg


def mark_read(member, message_id) -> bool:
    """Move the read marker forward to message_id. True if it moved."""
    return bool(ConversationMember.objects.filter(pk=member.pk).filter(
        Q(last_read_message__isnull=True) | Q(last_read_message_id__lt=message_id)
    ).update(last_read_message_id=message_id))


def peer_ids(conversation_id, user_id):
    """The other members' ids, or None if user_id isn't a member."""
    ids = list(ConversationMember.objects.filter(conversation_id=conversation_id)
               .values_list("user_id", flat=True))
    if user_id not in ids:
        return None
    return [i for i in ids if i != user_id]
