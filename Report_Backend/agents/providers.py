"""
Provider-agnostic LLM abstraction.
Set LLM_PROVIDER in .env to "openai", "anthropic", or "mock".
"""
from __future__ import annotations
from typing import Protocol, runtime_checkable
import time
from django.conf import settings


@runtime_checkable
class LLMProvider(Protocol):
    def generate(self, messages: list[dict]) -> str:
        ...


class MockProvider:
    """Returns deterministic placeholder text — no API key needed."""

    def generate(self, messages: list[dict]) -> str:
        # Extract the user prompt to personalise the mock
        user_msg = next((m["content"] for m in messages if m["role"] == "user"), "")
        # Identify section from prompt keywords
        section = "analysis"
        for keyword in ("scope", "risk", "findings", "gap", "recommendation", "conclusion"):
            if keyword in user_msg.lower():
                section = keyword
                break

        placeholders = {
            "scope": (
                "The scope of this ISMS audit covers the information systems, processes, "
                "and personnel within the defined organisational boundary. The assessment "
                "addresses all major controls under ISO/IEC 27001:2022 Clauses 4–10 and "
                "applicable Annex A controls. Critical business processes including data "
                "handling, access management, and incident response are included."
            ),
            "risk": (
                "Risk assessment was conducted using a structured methodology aligned with "
                "ISO/IEC 27005. Identified risks were evaluated for likelihood and impact, "
                "resulting in a prioritised risk register. High-priority risks include "
                "unauthorised access to sensitive data, inadequate patch management, and "
                "insufficient business continuity planning. Risk treatment options have been "
                "evaluated and appropriate controls selected."
            ),
            "findings": (
                "The compliance review identified several areas of strength including "
                "documented information security policies, established access control "
                "procedures, and a functioning incident response process. Areas requiring "
                "attention include: incomplete competency records for security personnel, "
                "gaps in supplier security assessment documentation, and limited evidence "
                "of regular management review outcomes."
            ),
            "gap": (
                "Gap analysis reveals the following non-conformities against ISO/IEC 27001 "
                "requirements: (1) Absence of a formal Statement of Applicability covering "
                "all 93 Annex A controls; (2) Incomplete risk treatment plan with unassigned "
                "ownership for 12 identified risks; (3) No documented evidence of annual "
                "internal audit completion for Clause 9 requirements. These gaps represent "
                "medium-to-high severity findings requiring immediate remediation."
            ),
            "recommendation": (
                "Priority recommendations: (1) Complete and formally approve the Statement "
                "of Applicability within 30 days; (2) Assign risk owners to all unmitigated "
                "risks and update the risk treatment plan; (3) Schedule and conduct an "
                "internal audit covering all ISMS clauses; (4) Implement mandatory annual "
                "security awareness training with tracked completion records; (5) Establish "
                "a supplier security assessment programme for all Tier-1 vendors."
            ),
            "conclusion": (
                "Based on the evidence reviewed, the organisation demonstrates a foundational "
                "level of ISMS maturity with key policies and procedures in place. However, "
                "the identified gaps in documentation, risk treatment, and audit evidence "
                "must be addressed before the ISMS can be considered fully conformant with "
                "ISO/IEC 27001:2022. A targeted remediation plan addressing the prioritised "
                "recommendations is advised prior to formal certification audit."
            ),
        }
        return placeholders.get(section, f"[Mock output for section: {section}]")


class DeepSeekProvider:
    """OpenAI-compatible client pointed at DeepSeek's API."""

    def __init__(self):
        import httpx
        import openai
        self._client = openai.OpenAI(
            api_key=settings.DEEPSEEK_API_KEY,
            base_url=settings.DEEPSEEK_BASE_URL,
            http_client=httpx.Client(),
        )

    def generate(self, messages: list[dict]) -> str:
        response = self._client.chat.completions.create(
            model="deepseek-chat",
            messages=messages,
            temperature=0.45,
            max_tokens=4000,
        )
        return response.choices[0].message.content or ""


class OpenAIProvider:
    def __init__(self):
        import openai
        self._client = openai.OpenAI(api_key=settings.OPENAI_API_KEY)

    def generate(self, messages: list[dict]) -> str:
        response = self._client.chat.completions.create(
            model="gpt-4o",
            messages=messages,
            temperature=0.3,
            max_tokens=1500,
        )
        return response.choices[0].message.content or ""


class AnthropicProvider:
    def __init__(self):
        import anthropic
        self._client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)

    def generate(self, messages: list[dict]) -> str:
        system = next((m["content"] for m in messages if m["role"] == "system"), "")
        human_msgs = [m for m in messages if m["role"] != "system"]
        response = self._client.messages.create(
            model="claude-3-5-sonnet-20241022",
            max_tokens=4096,
            system=system,
            messages=human_msgs,
            temperature=0.2,
        )
        return response.content[0].text if response.content else ""


def get_provider() -> LLMProvider:
    provider_name = getattr(settings, "LLM_PROVIDER", "mock").lower()
    if provider_name == "deepseek":
        return DeepSeekProvider()
    if provider_name == "openai":
        return OpenAIProvider()
    if provider_name == "anthropic":
        return AnthropicProvider()
    return MockProvider()
