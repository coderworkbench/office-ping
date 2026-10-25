"""Push chat events to members' open tabs over /ws/notifications/.

Best effort: the database is the source of truth and browsers resync when
their socket reconnects, so a failed push is logged, never raised.
"""
import logging

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

from apps.notifications.services import user_group_name
from .models import ConversationMember
from .serializers import message_dict

logger = logging.getLogger(__name__)


def _send(user_id, event):
    layer = get_channel_layer()
    if layer is None:
        return
    try:
        async_to_sync(layer.group_send)(user_group_name(user_id), event)
    except Exception:
        logger.exception("Failed chat push to user %s", user_id)


def message_sent(msg, client_id=""):
    """To every member, including the sender's other tabs and devices."""
    sender = msg.sender
    name = sender.get_full_name() or sender.username
    for m in ConversationMember.objects.filter(conversation_id=msg.conversation_id).select_related("user"):
        _send(m.user_id, {"type": "chat.message", "payload": {
            "conversation_id": msg.conversation_id,
            "message": message_dict(msg),
            "sender_name": name,
            "client_id": client_id,
            # In a meeting / do not disturb: no desktop notification.
            "quiet": m.user.wants_quiet,
        }})


def read(conversation_id, user_id, message_id):
    """The other person sees "Seen"; the reader's other tabs clear the badge."""
    payload = {"conversation_id": conversation_id, "user_id": user_id, "message_id": message_id}
    for uid in ConversationMember.objects.filter(conversation_id=conversation_id).values_list("user_id", flat=True):
        _send(uid, {"type": "chat.read", "payload": payload})
