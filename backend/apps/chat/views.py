from rest_framework import status, viewsets
from rest_framework.decorators import action, api_view
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle

from apps.audit.utils import record_audit
from apps.notifications.views import PingRateLimited, parse_rate
from . import broadcast, services
from .models import ConversationMember, Message
from .serializers import (MuteSerializer, OpenConversationSerializer, ReadSerializer,
                          SendMessageSerializer, message_dict)

PAGE = 30


class ConversationViewSet(viewsets.ViewSet):
    """The caller's one-to-one chats. A conversation the caller isn't in
    answers 404, so its existence isn't revealed."""

    permission_classes = [IsAuthenticated]
    lookup_value_regex = r"\d+"
    throttle_scope = "chat_send"

    def get_throttles(self):
        # Only sending a message counts against CHAT_RATE.
        if self.action == "messages" and self.request.method == "POST":
            return super().get_throttles()
        return []

    def throttled(self, request, wait):
        num, period, _ = parse_rate(ScopedRateThrottle.THROTTLE_RATES.get(self.throttle_scope))
        noun = "message" if num == 1 else "messages"
        raise PingRateLimited(wait=wait, detail=f"You can send {num} {noun} a {period}.")

    def _member(self, pk):
        try:
            return ConversationMember.objects.get(conversation_id=pk, user=self.request.user)
        except ConversationMember.DoesNotExist:
            raise NotFound()

    def list(self, request):
        return Response(services.summaries(request.user))

    def retrieve(self, request, pk=None):
        rows = services.summaries(request.user, int(pk))
        if not rows:
            raise NotFound()
        return Response(rows[0])

    def create(self, request):
        s = OpenConversationSerializer(data=request.data, context={"request": request})
        s.is_valid(raise_exception=True)
        other = s.validated_data["user_id"]
        conv, created = services.open_direct(request.user, other)
        if created:
            record_audit(request, "CHAT_STARTED", target=other.username,
                         metadata={"conversation_id": conv.id})
        return Response(services.summaries(request.user, conv.id)[0],
                        status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)

    @action(detail=True, methods=["get", "post"])
    def messages(self, request, pk=None):
        """GET ?before=<message id>: 30 older messages, oldest first."""
        member = self._member(pk)
        if request.method == "POST":
            return self._send(request, member)
        qs = Message.objects.filter(conversation_id=member.conversation_id)
        before = request.query_params.get("before", "")
        if before.isdigit():
            qs = qs.filter(id__lt=int(before))
        page = list(qs.order_by("-id")[:PAGE + 1])
        return Response({"results": [message_dict(m) for m in reversed(page[:PAGE])],
                         "has_more": len(page) > PAGE})

    def _send(self, request, member):
        s = SendMessageSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        if ConversationMember.objects.filter(conversation_id=member.conversation_id,
                                             user__is_active=False).exists():
            raise PermissionDenied("This person's account is deactivated.")
        msg = services.send_message(member, s.validated_data["body"])
        broadcast.message_sent(msg, s.validated_data["client_id"])
        return Response(message_dict(msg), status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def read(self, request, pk=None):
        member = self._member(pk)
        s = ReadSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        mid = s.validated_data["message_id"]
        if not Message.objects.filter(pk=mid, conversation_id=member.conversation_id).exists():
            raise ValidationError({"message_id": "That message isn't in this chat."})
        if services.mark_read(member, mid):
            broadcast.read(member.conversation_id, request.user.id, mid)
        return Response({"unread_total": services.unread_total(request.user)})

    @action(detail=True, methods=["post"])
    def mute(self, request, pk=None):
        member = self._member(pk)
        s = MuteSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        member.muted = s.validated_data["muted"]
        member.save(update_fields=["muted"])
        return Response({"muted": member.muted})


@api_view(["GET"])
def unread_total(request):
    return Response({"unread_total": services.unread_total(request.user)})
