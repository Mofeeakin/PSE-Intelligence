"""
Build a PDF compliance report using Django templates + WeasyPrint.
Falls back to a plain bytes message if WeasyPrint is not installed.
"""
import io
import re
from datetime import date
from django.template.loader import render_to_string
from reports.models import Report
from exports.colour_map import get_colour, infer_rating, AUDIT_RATING_COLOURS, GAP_RATING_COLOURS

_MD_BOLD_RE = re.compile(r"\*\*(.+?)\*\*")
_MD_BOLD_ALT_RE = re.compile(r"__(.+?)__")
_MD_ITALIC_RE = re.compile(r"(?<!\*)\*(?!\*)([^*\n]+?)\*(?!\*)")
_MD_HEADER_RE = re.compile(r"^#{1,6}\s+", re.MULTILINE)
_MD_BULLET_RE = re.compile(r"^[\-\*]\s+", re.MULTILINE)


def _sanitise_pdf(text) -> str:
    """Strip markdown formatting and § symbol — mirrors docx_builder._sanitise()."""
    text = text or ""
    text = _MD_BOLD_RE.sub(r"\1", text)
    text = _MD_BOLD_ALT_RE.sub(r"\1", text)
    text = _MD_ITALIC_RE.sub(r"\1", text)
    text = _MD_HEADER_RE.sub("", text)
    text = _MD_BULLET_RE.sub("", text)
    return text.replace("§", "Clause ").replace("  ", " ")


def _build_gap_rows(gaps, service_type: str) -> list[dict]:
    """Enrich gap objects with colour metadata for the template."""
    rows = []
    for gap in gaps:
        rating = gap.rating or infer_rating(gap.severity, "non_compliant", service_type)
        colour = get_colour(rating, service_type)
        gap.issue = _sanitise_pdf(gap.issue)
        rows.append({
            "gap": gap,
            "rating_label": colour["label"],
            "bg": f"#{colour['bg']}",
            "fg": f"#{colour['fg']}",
        })
    return rows


def build_pdf(report: Report) -> bytes:
    try:
        from weasyprint import HTML
    except ImportError:
        return b"WeasyPrint is not installed. Run: pip install weasyprint"

    service_type = getattr(report, "service_type", "audit_report") or "audit_report"
    is_gap = service_type == "gap_assessment"
    raw_sections = list(report.sections.order_by("order"))
    for sec in raw_sections:
        sec.section_name = _sanitise_pdf(sec.section_name)
        sec.content = _sanitise_pdf(sec.content or "")
    sections = raw_sections
    gaps = list(report.gaps.select_related("requirement").all())
    score = getattr(report, "compliance_score", None)
    legend = GAP_RATING_COLOURS if is_gap else AUDIT_RATING_COLOURS

    html_string = render_to_string(
        "exports/report.html",
        {
            "report": report,
            "service_type": service_type,
            "is_gap": is_gap,
            "sections": sections,
            "gap_rows": _build_gap_rows(gaps, service_type),
            "score": score,
            "legend": legend,
            "generated_date": date.today().strftime("%d %B %Y"),
        },
    )

    pdf_bytes = HTML(string=html_string).write_pdf()
    return pdf_bytes
