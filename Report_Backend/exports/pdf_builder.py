"""
Build a PDF compliance report using Django templates + WeasyPrint.
Falls back to a plain bytes message if WeasyPrint is not installed.
"""
import io
from datetime import date
from django.template.loader import render_to_string
from reports.models import Report
from exports.colour_map import get_colour, infer_rating, AUDIT_RATING_COLOURS, GAP_RATING_COLOURS


def _build_gap_rows(gaps, service_type: str) -> list[dict]:
    """Enrich gap objects with colour metadata for the template."""
    rows = []
    for gap in gaps:
        rating = gap.rating or infer_rating(gap.severity, "non_compliant", service_type)
        colour = get_colour(rating, service_type)
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
    sections = list(report.sections.order_by("order"))
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
