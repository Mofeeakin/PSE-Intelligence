from rest_framework import serializers
from .models import ReportLogo


class ReportLogoSerializer(serializers.ModelSerializer):
    image_url = serializers.SerializerMethodField()

    class Meta:
        model  = ReportLogo
        fields = ["id", "placement", "pages", "width_inches", "image_url", "created_at"]

    def get_image_url(self, obj):
        request = self.context.get("request")
        if obj.image and request:
            return request.build_absolute_uri(obj.image.url)
        return None
