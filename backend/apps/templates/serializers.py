from rest_framework import serializers
from .models import HOME_TEMPLATES_MAX, MessageTemplate


class MessageTemplateSerializer(serializers.ModelSerializer):
    class Meta:
        model = MessageTemplate
        fields = ("id", "title", "message", "created_by", "is_active",
                  "show_on_home", "created_at", "updated_at")
        read_only_fields = ("created_by", "created_at", "updated_at")

    def validate_show_on_home(self, value):
        if value and not (self.instance and self.instance.show_on_home):
            on_home = MessageTemplate.objects.filter(is_active=True, show_on_home=True)
            if self.instance:
                on_home = on_home.exclude(pk=self.instance.pk)
            if on_home.count() >= HOME_TEMPLATES_MAX:
                raise serializers.ValidationError(
                    f"Only {HOME_TEMPLATES_MAX} templates fit on the home screen. "
                    "Turn one off first.")
        return value
