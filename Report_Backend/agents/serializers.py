from rest_framework import serializers
from .models import ReportSection, AgentExecution


class ReportSectionSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReportSection
        fields = ("id", "section_name", "content", "agent_type", "confidence_score", "evidence_refs", "order", "created_at")
        read_only_fields = fields


class AgentExecutionSerializer(serializers.ModelSerializer):
    class Meta:
        model = AgentExecution
        fields = ("id", "agent_type", "stage", "message", "prompt_used", "raw_output",
                  "execution_time_ms", "confidence_score", "prompt_version", "created_at")
        read_only_fields = fields
