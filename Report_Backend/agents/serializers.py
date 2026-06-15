from rest_framework import serializers
from .models import ReportSection, AgentExecution


class ReportSectionSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReportSection
        fields = ("id", "section_name", "content", "agent_type", "confidence_score", "evidence_refs", "order", "created_at")
        read_only_fields = fields


class AgentExecutionSerializer(serializers.ModelSerializer):
    prompt_text = serializers.CharField(source="prompt_used", read_only=True)
    output_text = serializers.CharField(source="raw_output", read_only=True)
    duration_ms = serializers.IntegerField(source="execution_time_ms", read_only=True)

    class Meta:
        model = AgentExecution
        fields = ("id", "agent_type", "stage", "message", "prompt_text", "output_text",
                  "confidence_score", "duration_ms", "created_at")
        read_only_fields = fields
