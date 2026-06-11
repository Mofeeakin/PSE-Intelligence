"""
Build a professional DOCX compliance report matching the PSE company template standard.

Audit Report structure (ISO 27001 Internal Audit — matches Reflex Pay template):
  Cover Page
  Document Information Table
  Table of Contents
  1.0 Executive Summary
  2.0 Audit Details  (2.1 Criteria | 2.2 Objectives | 2.3 Method | 2.4 Scope |
                      2.5 Findings Definition | 2.6 Opinion Rating Triangle)
  3.0 … N  Clause Findings (§4–§10 + Annex A groups) — colour on Status cell only
  §N+1  Consolidated Audit Findings
  §N+2  Audit Conclusions and Recommendation

Gap Assessment Report structure:
  Cover Page
  Document Information Table
  Table of Contents
  Score Summary
  CIRC Rating Legend (table)
  Scope (prose)
  Executive Summary (prose)
  Gap Findings by Clause Group (tables)
  Gap / Non-Conformity Register
  Conclusion

Ratings colour scheme:
  Audit  : A (green) | OFI/OBS (blue) | MiNC (amber) | MaNC (red)
  Gap    : Fully Implemented (green) | Partially Implemented (amber) |
           Not Implemented (red) | Not Applicable (grey)
"""
from __future__ import annotations

import io
import json
import logging
from pathlib import Path

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Inches, Pt, RGBColor

from reports.models import Report
from exports.colour_map import (
    AUDIT_RATING_COLOURS,
    GAP_RATING_COLOURS,
    get_colour,
    get_colour_by_status,
    infer_rating,
)

logger = logging.getLogger(__name__)

LOGO_PATH = Path(__file__).parent / "assets" / "pse_logo.png"
JSON_PREFIX = "__JSON__:"

# Corporate colours
CORP_BLUE  = "002DA8"   # PSE corporate blue
DARK_NAVY  = "1E3A5F"   # headings / table headers
MID_GREY   = "666666"
LIGHT_BG   = "F4F6FA"   # alternating row tint (gap only)


# ── Low-level helpers ─────────────────────────────────────────────────────────

def _set_cell_bg(cell, hex_color: str):
    tc = cell._tc
    tcPr = tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:fill"), hex_color.lstrip("#"))
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:val"), "clear")
    tcPr.append(shd)


def _hex_rgb(h: str) -> RGBColor:
    h = h.lstrip("#")
    return RGBColor(int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))


def _style_run(run, size_pt: int = 10, bold: bool = False, colour: str = None, italic: bool = False):
    run.font.size = Pt(size_pt)
    run.font.bold = bold
    run.font.italic = italic
    if colour:
        run.font.color.rgb = _hex_rgb(colour)


def _sanitise(text) -> str:
    """Strip § (and Unicode section sign U+00A7) and collapse whitespace."""
    if not text:
        return ""
    if not isinstance(text, str):
        text = str(text)
    return (
        text
        .replace("§", "Clause ")   # Unicode section sign §
        .replace("§", "Clause ")        # literal ASCII lookalike if any
        .replace("  ", " ")
        .strip()
    )


def _header_row(table, headers: list[str], bg: str = DARK_NAVY, font_size: int = 9):
    row = table.rows[0]
    for i, text in enumerate(headers):
        cell = row.cells[i]
        cell.text = _sanitise(text)
        run = cell.paragraphs[0].runs[0]
        _style_run(run, size_pt=font_size, bold=True, colour="FFFFFF")
        _set_cell_bg(cell, bg)
        cell.paragraphs[0].paragraph_format.space_before = Pt(2)
        cell.paragraphs[0].paragraph_format.space_after = Pt(2)


def _cell_text(cell, text: str, size_pt: int = 9, bold: bool = False, colour: str = None):
    text = _sanitise(text)
    cell.text = text
    if cell.paragraphs[0].runs:
        run = cell.paragraphs[0].runs[0]
        _style_run(run, size_pt=size_pt, bold=bold, colour=colour)
        cell.paragraphs[0].paragraph_format.space_before = Pt(2)
        cell.paragraphs[0].paragraph_format.space_after = Pt(2)


def _add_heading(doc: Document, text: str, level: int = 1, colour: str = DARK_NAVY):
    h = doc.add_heading(_sanitise(text), level=level)
    if h.runs:
        h.runs[0].font.color.rgb = _hex_rgb(colour)
        h.runs[0].font.size = Pt(13 if level == 1 else 11)
    return h


# ── Cover Page ────────────────────────────────────────────────────────────────

def _add_cover(doc: Document, report: Report, is_gap: bool, logo=None):
    # Logo — use uploaded logo if provided, else fall back to static asset
    logo_path = None
    logo_width = 2.4
    if logo and logo.image:
        logo_path = logo.image.path
        logo_width = logo.width_inches
    elif LOGO_PATH.exists():
        logo_path = str(LOGO_PATH)

    if logo_path:
        try:
            logo_para = doc.add_paragraph()
            logo_para.alignment = WD_ALIGN_PARAGRAPH.CENTER
            run = logo_para.add_run()
            run.add_picture(logo_path, width=Inches(logo_width))
            doc.add_paragraph()
        except Exception as exc:
            logger.warning("DOCX: Could not embed logo — %s", exc)

    # Report type badge
    badge_label = "GAP ASSESSMENT REPORT" if is_gap else "COMPLIANCE AUDIT REPORT"
    badge = doc.add_paragraph()
    badge.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = badge.add_run(badge_label)
    _style_run(r, size_pt=9, colour="9A9690")

    doc.add_paragraph()

    # Title
    title_p = doc.add_paragraph()
    title_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = title_p.add_run(report.title)
    _style_run(r, size_pt=24, bold=True, colour=CORP_BLUE)

    # Organisation
    org_p = doc.add_paragraph()
    org_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = org_p.add_run(report.organisation)
    _style_run(r, size_pt=14, colour="444444")

    doc.add_paragraph()

    meta = [
        "Standard: ISO/IEC 27001:2022",
        f"Report Type: {'Gap Assessment' if is_gap else 'Internal Audit'}",
    ]
    if report.department:
        meta.append(f"Department: {report.department}")

    for line in meta:
        p = doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        r = p.add_run(line)
        _style_run(r, size_pt=11, colour=MID_GREY)

    doc.add_page_break()


def _apply_header_logo(doc: Document, logo) -> None:
    """Embed logo right-aligned in the page header of every section (every-page placement)."""
    for section in doc.sections:
        header = section.header
        header.is_linked_to_previous = False
        p = header.paragraphs[0] if header.paragraphs else header.add_paragraph()
        p.clear()
        p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
        run = p.add_run()
        try:
            run.add_picture(logo.image.path, width=Inches(logo.width_inches))
        except Exception as exc:
            logger.warning("DOCX: Could not embed header logo — %s", exc)


def _add_section_break(doc: Document) -> None:
    """Insert a next-page section break so the new section gets its own header."""
    from docx.oxml import OxmlElement as _OxmlElement
    from docx.oxml.ns import qn as _qn
    new_sect = _OxmlElement("w:sectPr")
    new_sect_type = _OxmlElement("w:type")
    new_sect_type.set(_qn("w:val"), "nextPage")
    new_sect.insert(0, new_sect_type)
    p = doc.add_paragraph()
    pPr = p._p.get_or_add_pPr()
    pPr.append(new_sect)


def _apply_header_logo_selected(doc: Document, logo) -> None:
    """
    Apply logo header only to sections whose 1-based index is in logo.pages.
    Sections are created by the caller via _add_section_break(); section index
    1 = cover, 2 = doc-info/TOC, 3+ = content.
    """
    selected = set(logo.pages or [])
    for i, section in enumerate(doc.sections, start=1):
        header = section.header
        header.is_linked_to_previous = False
        if i in selected:
            p = header.paragraphs[0] if header.paragraphs else header.add_paragraph()
            p.clear()
            p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
            run = p.add_run()
            try:
                run.add_picture(logo.image.path, width=Inches(logo.width_inches))
            except Exception as exc:
                logger.warning("DOCX: Could not embed selected-page header logo (section %d) — %s", i, exc)
        else:
            # Ensure this section has an empty header (don't inherit previous)
            p = header.paragraphs[0] if header.paragraphs else header.add_paragraph()
            p.clear()


# ── Document Information Table ────────────────────────────────────────────────

def _add_doc_info_table(doc: Document, report: Report):
    _add_heading(doc, "Document Information", level=2)

    from datetime import date as _date
    author_name = ""
    if report.user:
        full = report.user.get_full_name()
        author_name = full if full.strip() else report.user.username

    rows_data = [
        ("DOCUMENT REFERENCE", f"PSE-{report.id:04d}-{report.standard.code}"),
        ("VERSION",            "1.0"),
        ("DATE OF CREATION",   _date.today().strftime("%d %B %Y")),
        ("DOCUMENT AUTHOR",    author_name or "PSE Consulting"),
        ("CLASSIFICATION",     "Internal — Confidential"),
        ("APPROVAL",           "Pending"),
    ]

    tbl = doc.add_table(rows=len(rows_data) + 1, cols=2)
    tbl.style = "Light Shading"
    _header_row(tbl, ["Field", "Value"], bg=CORP_BLUE)

    for i, (field, value) in enumerate(rows_data, start=1):
        _cell_text(tbl.rows[i].cells[0], field, bold=True)
        _cell_text(tbl.rows[i].cells[1], value)

    doc.add_paragraph()


# ── Table of Contents ─────────────────────────────────────────────────────────

# Right tab position (twips): A4 text width 16 cm = 9072 twips; stop at 8900
_TOC_TAB_TWIPS = "8900"


def _toc_entry(doc: Document, text: str, indent_cm: float = 0,
               bold: bool = False, size_pt: int = 10, colour: str = DARK_NAVY):
    """Render one TOC line with a dot-leader tab reaching the right margin."""
    p = doc.add_paragraph()
    p.clear()
    p.paragraph_format.space_before = Pt(2)
    p.paragraph_format.space_after = Pt(2)

    if indent_cm:
        from docx.shared import Cm as _Cm
        p.paragraph_format.left_indent = _Cm(indent_cm)

    # Attach a right-aligned dot-leader tab stop
    pPr = p._p.get_or_add_pPr()
    tabs_el = OxmlElement("w:tabs")
    tab_el = OxmlElement("w:tab")
    tab_el.set(qn("w:val"), "right")
    tab_el.set(qn("w:leader"), "dot")
    tab_el.set(qn("w:pos"), _TOC_TAB_TWIPS)
    tabs_el.append(tab_el)
    pPr.append(tabs_el)

    r = p.add_run(_sanitise(text))
    _style_run(r, size_pt=size_pt, bold=bold, colour=colour)


def _toc_field_begin(doc: Document):
    """
    Open a Word complex-field TOC.  Everything added between this call and
    _toc_field_end() becomes the 'dirty' display text — visible in PDF / before
    the user updates fields in Word.  When Word opens the file it replaces these
    paragraphs with a proper page-numbered TOC derived from the Heading styles.
    """
    p = doc.add_paragraph()
    p.clear()
    p.paragraph_format.space_before = Pt(0)
    p.paragraph_format.space_after  = Pt(0)

    r_begin = OxmlElement("w:r")
    fc_begin = OxmlElement("w:fldChar")
    fc_begin.set(qn("w:fldCharType"), "begin")
    fc_begin.set(qn("w:dirty"),       "true")   # Word auto-updates on open
    r_begin.append(fc_begin)
    p._p.append(r_begin)

    r_instr = OxmlElement("w:r")
    instr = OxmlElement("w:instrText")
    instr.set(qn("xml:space"), "preserve")
    instr.text = ' TOC \\o "1-3" \\h \\z \\u '
    r_instr.append(instr)
    p._p.append(r_instr)

    r_sep = OxmlElement("w:r")
    fc_sep = OxmlElement("w:fldChar")
    fc_sep.set(qn("w:fldCharType"), "separate")
    r_sep.append(fc_sep)
    p._p.append(r_sep)


def _toc_field_end(doc: Document):
    """Close the complex TOC field opened by _toc_field_begin()."""
    p = doc.add_paragraph()
    p.clear()
    p.paragraph_format.space_before = Pt(0)
    p.paragraph_format.space_after  = Pt(0)
    r_end = OxmlElement("w:r")
    fc_end = OxmlElement("w:fldChar")
    fc_end.set(qn("w:fldCharType"), "end")
    r_end.append(fc_end)
    p._p.append(r_end)


def _add_toc(doc: Document, report, is_gap: bool):
    """
    Build the Table of Contents page.

    Uses a Word-native TOC field (Heading 1–3 styles, dirty=true so Word
    auto-updates page numbers on open) wrapping manually-constructed
    dot-leader entries.  The manual entries serve as the static fallback in
    PDF exports and as the 'dirty' placeholder before Word updates the field.
    """
    _add_heading(doc, "Table of Contents", level=1)

    sections = list(report.sections.order_by("order"))

    # Open Word native TOC field — wraps all manual entries below
    _toc_field_begin(doc)

    if is_gap:
        _toc_entry(doc, "1.  Score Summary",     bold=True,  size_pt=11)
        _toc_entry(doc, "2.  CIRC Rating Legend", bold=True,  size_pt=11)
        top_num = 3
        for sec in sections:
            name_lower = sec.section_name.lower()
            if "scope" in name_lower and not (sec.content or "").startswith(JSON_PREFIX):
                _toc_entry(doc, f"{top_num}.  Scope of Assessment", bold=True, size_pt=11)
                top_num += 1
            elif "executive" in name_lower:
                _toc_entry(doc, f"{top_num}.  Executive Summary",   bold=True, size_pt=11)
                top_num += 1

        gap_num = top_num
        _toc_entry(doc, f"{gap_num}.  Gap Findings by Clause Group", bold=True, size_pt=11)
        sub = 1
        for sec in sections:
            if (sec.content or "").startswith(JSON_PREFIX):
                label = _sanitise(sec.section_name)
                _toc_entry(doc, f"{gap_num}.{sub}  {label}", indent_cm=0.8,
                           colour=MID_GREY, size_pt=10)
                sub += 1
        _toc_entry(doc, f"{gap_num + 1}.  Gap Findings Register", bold=True, size_pt=11)
        _toc_entry(doc, f"{gap_num + 2}.  Conclusion",            bold=True, size_pt=11)

    else:
        _toc_entry(doc, "1.0  Executive Summary", bold=True, size_pt=11)
        _toc_entry(doc, "2.0  Audit Details",      bold=True, size_pt=11)
        for sub_label in [
            "2.1  Audit Criteria and Reference Documents",
            "2.2  Audit Objectives",
            "2.3  Audit Method",
            "2.4  Scope of Audit",
            "2.5  Audit Findings Definition (Status)",
            "2.6  Opinion Rating (1-5)",
        ]:
            _toc_entry(doc, sub_label, indent_cm=0.8, colour=MID_GREY, size_pt=10)

        # Clause sections: exclude prose-only sections handled outside the numbered list
        clause_secs = [
            s for s in sections
            if "executive" not in s.section_name.lower()
            and "scope"     not in s.section_name.lower()
            and "conclusion" not in s.section_name.lower()
        ]
        sec_num = 3
        for sec in clause_secs:
            label = _sanitise(sec.section_name)
            _toc_entry(doc, f"{sec_num}.0  {label}", bold=True, size_pt=11)
            sec_num += 1

        _toc_entry(doc, f"{sec_num}.0  Consolidated Audit Findings",          bold=True, size_pt=11)
        _toc_entry(doc, f"{sec_num + 1}.0  Audit Conclusions and Recommendation", bold=True, size_pt=11)

    # Close Word native TOC field
    _toc_field_end(doc)

    doc.add_page_break()


# ── Rating Legend (gap assessment only) ──────────────────────────────────────

def _add_legend(doc: Document, service_type: str):
    """Gap assessment only — renders CIRC rating table."""
    colours = GAP_RATING_COLOURS
    heading = "CIRC Opinion Rating Legend"
    _add_heading(doc, heading, level=2)

    descriptions = {
        "fully_implemented":     "Control fully in place with documented evidence.",
        "partially_implemented": "Control exists but implementation is incomplete or inconsistent.",
        "not_implemented":       "Control has not been implemented; remediation required.",
        "not_applicable":        "Control is out of scope or not applicable to this organisation.",
    }

    tbl = doc.add_table(rows=1 + len(colours), cols=2)
    tbl.style = "Light Shading"
    _header_row(tbl, ["Rating / Classification", "Description"])

    for row_idx, (key, meta) in enumerate(colours.items(), start=1):
        label_cell = tbl.rows[row_idx].cells[0]
        desc_cell  = tbl.rows[row_idx].cells[1]
        label_cell.text = meta["label"]
        desc_cell.text  = descriptions.get(key, "")
        _set_cell_bg(label_cell, meta["bg"])
        if label_cell.paragraphs[0].runs:
            _style_run(label_cell.paragraphs[0].runs[0], size_pt=9, bold=True, colour=meta["fg"])
        if desc_cell.paragraphs[0].runs:
            _style_run(desc_cell.paragraphs[0].runs[0], size_pt=9)

    doc.add_paragraph()


# ── Opinion Triangle (audit only — §2.6) ─────────────────────────────────────

def _draw_opinion_triangle() -> io.BytesIO:
    """
    Draw a colour-coded triangle pyramid in the style of the PSE audit template.
    Returns a PNG image in a BytesIO buffer.
    Layers (top to bottom):
        Green  — A / OFI      (conformant / opportunities)
        Amber  — OBS / MiNC   (observations / minor NC)
        Red    — MaNC          (major non-conformity)
    """
    try:
        from PIL import Image, ImageDraw, ImageFont
    except ImportError:
        return None

    W, H = 520, 320
    img = Image.new("RGBA", (W, H), (255, 255, 255, 0))
    draw = ImageDraw.Draw(img)

    # Triangle points (apex at top-centre, base at bottom)
    apex_x = W // 2
    # Tier heights
    t1_y0, t1_y1 = 0,   H // 3         # top (green)
    t2_y0, t2_y1 = H // 3, 2 * H // 3  # mid (amber)
    t3_y0, t3_y1 = 2 * H // 3, H       # bottom (red)

    def _tier_poly(y0, y1, W, apex_x):
        """Trapezoid: narrower at top, wider at bottom."""
        total_H = H
        left0  = apex_x - (apex_x * y0 / total_H)
        right0 = apex_x + (apex_x * y0 / total_H)
        left1  = apex_x - (apex_x * y1 / total_H)
        right1 = apex_x + (apex_x * y1 / total_H)
        # Add padding so tier edges don't overlap
        pad = 2
        return [
            (left0 + pad, y0 + pad),
            (right0 - pad, y0 + pad),
            (right1 - pad, y1 - pad),
            (left1 + pad, y1 - pad),
        ]

    GREEN = (45, 106, 79)
    AMBER = (230, 126, 34)
    RED   = (192, 57, 43)

    draw.polygon(_tier_poly(t1_y0, t1_y1, W, apex_x), fill=GREEN)
    draw.polygon(_tier_poly(t2_y0, t2_y1, W, apex_x), fill=AMBER)
    draw.polygon(_tier_poly(t3_y0, t3_y1, W, apex_x), fill=RED)

    # Try to load a font; fall back to default
    font_sm, font_md, font_lg = None, None, None
    try:
        font_sm = ImageFont.truetype("arial.ttf", 16)
        font_md = ImageFont.truetype("arialbd.ttf", 22)
        font_lg = ImageFont.truetype("arialbd.ttf", 28)
    except Exception:
        try:
            font_sm = ImageFont.load_default()
            font_md = font_sm
            font_lg = font_sm
        except Exception:
            pass

    WHITE = (255, 255, 255)

    def _draw_centred(text, y_mid, font):
        if font is None:
            return
        bbox = draw.textbbox((0, 0), text, font=font)
        tw = bbox[2] - bbox[0]
        th = bbox[3] - bbox[1]
        draw.text(((W - tw) / 2, y_mid - th / 2), text, fill=WHITE, font=font)

    _draw_centred("A / OFI",      (t1_y0 + t1_y1) // 2, font_sm)
    _draw_centred("OBS / MiNC",   (t2_y0 + t2_y1) // 2, font_md)
    _draw_centred("MaNC",         (t3_y0 + t3_y1) // 2, font_lg)

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return buf


# ── Audit Details block (§2.0–§2.6) ─────────────────────────────────────────

def _add_audit_details(doc: Document, report: Report, scope_content: str):
    """
    Render the Audit Details section matching the PSE/Reflex Pay template structure.
    Includes: company table, criteria, objectives, method, scope, findings
    definition, and the opinion rating triangle.
    """
    _add_heading(doc, "2.0  Audit Details", level=1)

    from datetime import date as _date

    # Company info table ──────────────────────────────────────────────────────
    info_rows = [
        ("Company name:",      report.organisation or ""),
        ("Address:",           ""),
        ("Website:",           ""),
        ("",                   ""),
        ("Audit standard(s):", "ISO 27001:2022"),
        ("Date(s) of audit(s):", _date.today().strftime("%d %B %Y")),
        ("Duration:",          ""),
        ("Audit team members:", "PSE Consulting"),
        ("Scope Summary:",     (scope_content or report.scope or "")[:300]),
        ("Audit participants:", ""),
    ]

    tbl = doc.add_table(rows=len(info_rows), cols=2)
    tbl.style = "Table Grid"
    col_widths = [Cm(5.5), Cm(11.5)]
    for col_i, w in enumerate(col_widths):
        for cell in tbl.columns[col_i].cells:
            cell.width = w

    for row_i, (label, value) in enumerate(info_rows):
        lc = tbl.rows[row_i].cells[0]
        vc = tbl.rows[row_i].cells[1]
        lc.text = label
        vc.text = value
        if lc.paragraphs[0].runs:
            _style_run(lc.paragraphs[0].runs[0], size_pt=9, bold=True)
        if vc.paragraphs[0].runs:
            _style_run(vc.paragraphs[0].runs[0], size_pt=9)

    doc.add_paragraph()

    # §2.1 Audit Criteria ─────────────────────────────────────────────────────
    _add_heading(doc, "2.1  Audit Criteria and Reference Documents", level=2)
    p = doc.add_paragraph()
    r = p.add_run(
        "The international standard for information security ISO/IEC 27001:2022 (and its "
        "subsequent revisions) will be used as the basis of the criteria for the audit programme. "
        "The audit was carried out in English language."
    )
    _style_run(r, size_pt=10)
    doc.add_paragraph()

    # §2.2 Audit Objectives ───────────────────────────────────────────────────
    _add_heading(doc, "2.2  Audit Objectives", level=2)
    objectives_intro = doc.add_paragraph()
    r = objectives_intro.add_run(
        "In line with the requirements of the international standards, "
        "the overall objectives of this internal audit are to:"
    )
    _style_run(r, size_pt=10)

    objectives = [
        "Ensure that the implemented management systems and best practices are carried out "
        "effectively, efficiently, and economically to benefit the organisation.",
        "Determine the conformity of the organisation's management systems with audit criteria.",
        "Identify further opportunities for continual improvement, which may extend beyond the "
        "criteria set out in international standards.",
        "Provide the organisation with the internal assurance that the management systems are "
        "effectively managed and risks to the business are minimised.",
    ]
    for obj in objectives:
        p = doc.add_paragraph(style="List Bullet")
        p.clear()
        r = p.add_run(obj)
        _style_run(r, size_pt=10)
    doc.add_paragraph()

    # §2.3 Audit Method ───────────────────────────────────────────────────────
    _add_heading(doc, "2.3  Audit Method", level=2)
    p = doc.add_paragraph()
    r = p.add_run(
        "The audit was conducted in accordance with ISO 19011. The combination of checklists "
        "and questionnaires, interviews, observation, documents, system, and record review with "
        "the auditee was used to collect evidence to validate the effectiveness of the implemented "
        "Information Security Management System (ISMS)."
    )
    _style_run(r, size_pt=10)
    doc.add_paragraph()

    # §2.4 Scope of Audit ─────────────────────────────────────────────────────
    _add_heading(doc, "2.4  Scope of Audit", level=2)
    scope_text = scope_content or report.scope or \
        "The audit covered the organisation's Information Security Management System (ISMS) " \
        "against the requirements of ISO/IEC 27001:2022, including all in-scope locations, " \
        "business activities, processes, information assets, and products and services."
    for line in scope_text.split("\n"):
        line = line.strip()
        if not line:
            continue
        p = doc.add_paragraph()
        r = p.add_run(line)
        _style_run(r, size_pt=10)
        p.paragraph_format.space_after = Pt(3)
    doc.add_paragraph()

    # §2.5 Audit Findings Definition ──────────────────────────────────────────
    _add_heading(doc, "2.5  Audit Findings Definition (Status)", level=2)
    p = doc.add_paragraph()
    r = p.add_run(
        "Where a discrepancy against the standard has been found, one of five types of items "
        "has been raised as follows:"
    )
    _style_run(r, size_pt=10)

    findings_defs = [
        ("Acceptable (A):", "conformance with the management system or process."),
        ("Major Non-Conformity (MaNC):", "a significant issue that represents a breakdown of the "
         "operation of the management system or process."),
        ("Minor Non-Conformity (MiNC):", "a single lapse that does not indicate a breakdown of the "
         "management system or process."),
        ("Observation (OBS):", "a comment which may be of use to the auditee based on the experience "
         "of other implementations and the expertise of the internal auditor."),
        ("Opportunity for Improvement (OFI):", "an observation or suggestion regarding a potential "
         "improvement opportunity. No action is necessarily required."),
    ]
    for label, definition in findings_defs:
        p = doc.add_paragraph(style="List Bullet")
        p.clear()
        r_bold = p.add_run(label + " ")
        _style_run(r_bold, size_pt=10, bold=True)
        r_def = p.add_run(definition)
        _style_run(r_def, size_pt=10)
    doc.add_paragraph()

    # §2.6 Opinion Rating ─────────────────────────────────────────────────────
    _add_heading(doc, "2.6  Opinion Rating (1-5)", level=2)
    triangle_buf = _draw_opinion_triangle()
    if triangle_buf:
        pic_para = doc.add_paragraph()
        pic_para.alignment = WD_ALIGN_PARAGRAPH.CENTER
        run = pic_para.add_run()
        run.add_picture(triangle_buf, width=Inches(3.5))
    else:
        # Fallback: small text table
        tbl = doc.add_table(rows=4, cols=2)
        tbl.style = "Light Shading"
        _header_row(tbl, ["Rating", "Description"])
        fallback = [
            ("A / OFI",    "Acceptable / Opportunity for Improvement"),
            ("OBS / MiNC", "Observation / Minor Non-Conformity"),
            ("MaNC",       "Major Non-Conformity"),
        ]
        colours_fb = ["1D6A3C", "E67E22", "C0392B"]
        for i, (lbl, dsc) in enumerate(fallback, start=1):
            _cell_text(tbl.rows[i].cells[0], lbl, bold=True, colour="FFFFFF")
            _set_cell_bg(tbl.rows[i].cells[0], colours_fb[i - 1])
            _cell_text(tbl.rows[i].cells[1], dsc)
    doc.add_paragraph()
    doc.add_page_break()


# ── Consolidated Audit Findings (§9) ─────────────────────────────────────────

def _add_consolidated_findings(doc: Document, all_findings: list[dict]):
    """
    Render a consolidated grouped summary of all clause findings — matching
    the template §9 layout:  MaNC / MiNC / OBS / OFI bullet lists.
    """
    _add_heading(doc, "Consolidated Audit Findings", level=1)

    buckets = {
        "MaNC": [],
        "MiNC": [],
        "OBS":  [],
        "OFI":  [],
        "A":    [],
    }
    # Accept both full names and abbreviations
    alias = {
        "Major Non-Conformity": "MaNC",
        "Major Non-Conformance": "MaNC",
        "Minor Non-Conformity": "MiNC",
        "Minor Non-Conformance": "MiNC",
        "Observation": "OBS",
        "Opportunity for Improvement": "OFI",
        "Acceptable": "A",
        "Conformant": "A",
    }
    for f in all_findings:
        raw = (f.get("status") or "").strip()
        key = alias.get(raw, raw)
        if key in buckets:
            buckets[key].append(f)

    labels = {
        "MaNC": "Major Non-conformities [MaNC]",
        "MiNC": "Minor Non-conformities [MiNC]",
        "OBS":  "Observations",
        "OFI":  "Opportunities for Improvement",
    }
    colours_map = {
        "MaNC": "C0392B",
        "MiNC": "E67E22",
        "OBS":  "2471A3",
        "OFI":  "1D6A3C",
    }

    for key in ("MaNC", "MiNC", "OBS", "OFI"):
        items = buckets[key]
        # Section label
        p_label = doc.add_paragraph()
        r = p_label.add_run(f"{labels[key]}:")
        _style_run(r, size_pt=10, bold=True, colour=colours_map[key])

        if not items:
            p = doc.add_paragraph(style="List Bullet")
            p.clear()
            r = p.add_run("None identified.")
            _style_run(r, size_pt=10, colour=MID_GREY)
        else:
            for f in items:
                clause = f.get("clause_ref", "")
                finding = (f.get("audit_finding") or f.get("requirement_summary") or "")[:120]
                p = doc.add_paragraph(style="List Bullet")
                p.clear()
                r_clause = p.add_run(f"Clause {clause} — " if clause else "")
                _style_run(r_clause, size_pt=9, bold=True)
                r_text = p.add_run(finding)
                _style_run(r_text, size_pt=9)
        doc.add_paragraph()
    doc.add_paragraph()


# ── Audit Conclusions checklist (§10) ────────────────────────────────────────

def _add_audit_conclusions(doc: Document):
    """
    Render the §10 Audit Conclusions table matching the PSE template:
    3-row Yes/No checklist table.
    """
    _add_heading(doc, "Audit Conclusions and Recommendation", level=1)

    # Introductory checklist table
    checklist = [
        ("Has there been any serious deviation from the audit plan? (If yes, please specify)", "No ✓"),
        ("The management review processes are in place and adequate", "Yes ✓"),
        ("The audit was successful in meeting the stated objectives", "Yes ✓"),
    ]

    tbl = doc.add_table(rows=len(checklist), cols=2)
    tbl.style = "Table Grid"
    col_widths = [Cm(13.5), Cm(3.5)]
    for col_i, w in enumerate(col_widths):
        for cell in tbl.columns[col_i].cells:
            cell.width = w

    for row_i, (question, answer) in enumerate(checklist):
        qc = tbl.rows[row_i].cells[0]
        ac = tbl.rows[row_i].cells[1]
        qc.text = question
        ac.text = answer
        if qc.paragraphs[0].runs:
            _style_run(qc.paragraphs[0].runs[0], size_pt=10)
        if ac.paragraphs[0].runs:
            _style_run(ac.paragraphs[0].runs[0], size_pt=10, bold=True)
        qc.paragraphs[0].paragraph_format.space_before = Pt(3)
        qc.paragraphs[0].paragraph_format.space_after = Pt(3)

    doc.add_paragraph()


# ── Score Summary ─────────────────────────────────────────────────────────────

def _add_score_summary(doc: Document, report: Report):
    score = getattr(report, "compliance_score", None)
    if not score:
        return

    _add_heading(doc, "Compliance Score Summary", level=2)

    tbl = doc.add_table(rows=4, cols=3)
    tbl.style = "Light Shading"
    _header_row(tbl, ["Dimension", "Score", "Weight"])

    rows_data = [
        ("Section Score",     f"{score.section_score:.1f}%",     "40%"),
        ("Evidence Score",    f"{score.evidence_score:.1f}%",    "35%"),
        ("Consistency Score", f"{score.consistency_score:.1f}%", "25%"),
    ]
    for i, (dim, val, wt) in enumerate(rows_data, start=1):
        _cell_text(tbl.rows[i].cells[0], dim)
        _cell_text(tbl.rows[i].cells[1], val, bold=True)
        _cell_text(tbl.rows[i].cells[2], wt)

    doc.add_paragraph()
    total_p = doc.add_paragraph()
    r = total_p.add_run(f"Overall Score: {score.total_score:.1f}%  |  Status: {score.status}")
    _style_run(r, size_pt=13, bold=True, colour=DARK_NAVY)
    doc.add_paragraph()


# ── Prose section renderer ────────────────────────────────────────────────────

def _add_prose_section(doc: Document, section_name: str, content: str):
    _add_heading(doc, _sanitise(section_name), level=1)
    for line in content.split("\n"):
        line = _sanitise(line.strip())
        if not line:
            continue
        p = doc.add_paragraph()
        r = p.add_run(line)
        _style_run(r, size_pt=10)
        p.paragraph_format.space_after = Pt(4)
    doc.add_paragraph()


# ── Clause findings table (JSON section renderer) ────────────────────────────

def _add_audit_findings_table(doc: Document, section_name: str, findings: list[dict]):
    """
    Render audit findings as a colour-coded 5-column table matching the PSE template.
    Columns: CONTROL | AUDIT FINDINGS | STATUS | EVIDENCE REVIEWED | RECOMMENDATION
    Only the STATUS cell is colour-coded; all other cells have white background.
    """
    _add_heading(doc, section_name, level=2, colour=CORP_BLUE)

    headers = ["CONTROL", "AUDIT FINDINGS", "STATUS", "EVIDENCE REVIEWED", "RECOMMENDATION"]
    col_widths = [Cm(3.5), Cm(5.0), Cm(2.5), Cm(4.5), Cm(4.5)]

    tbl = doc.add_table(rows=1 + len(findings), cols=len(headers))
    tbl.style = "Table Grid"
    _header_row(tbl, headers, bg=DARK_NAVY)

    # Set column widths
    for col_i, w in enumerate(col_widths):
        for cell in tbl.columns[col_i].cells:
            cell.width = w

    for row_idx, f in enumerate(findings, start=1):
        cells = tbl.rows[row_idx].cells
        status_str = f.get("status", "OBS")
        colour = get_colour_by_status(status_str, "audit_report")

        clause         = f.get("clause_ref") or ""
        control        = (f.get("requirement_summary") or f.get("control_name") or "")[:100]
        finding        = (f.get("audit_finding") or "")[:250]
        evidence       = (f.get("evidence_reviewed") or f.get("evidence") or "")[:200]
        recommendation = (f.get("recommendation") or "")[:200]

        _cell_text(cells[0], f"{clause} {control}".strip(), size_pt=9, bold=True)
        _cell_text(cells[1], finding,                       size_pt=9)
        _cell_text(cells[2], colour["label"],               size_pt=9, bold=True, colour=colour["fg"])
        _set_cell_bg(cells[2], colour["bg"])
        _cell_text(cells[3], evidence,                      size_pt=9)
        _cell_text(cells[4], recommendation,                size_pt=9)

        # Explicit white background for non-status cells
        for ci in (0, 1, 3, 4):
            _set_cell_bg(cells[ci], "FFFFFF")

    doc.add_paragraph()


def _add_gap_findings_table(doc: Document, section_name: str, findings: list[dict]):
    """Render gap findings as a colour-coded 6-column table."""
    _add_heading(doc, section_name, level=2, colour=CORP_BLUE)

    headers = ["Clause Ref", "Control", "CIRC Rating", "Current State", "Required State", "Recommendation"]
    tbl = doc.add_table(rows=1 + len(findings), cols=len(headers))
    tbl.style = "Light Shading"
    _header_row(tbl, headers, bg=DARK_NAVY)

    for row_idx, f in enumerate(findings, start=1):
        cells = tbl.rows[row_idx].cells
        rating_str = f.get("circ_rating", "Not Implemented")
        colour = get_colour_by_status(rating_str, "gap_assessment")

        _cell_text(cells[0], f.get("clause_ref") or "",              size_pt=9, bold=True)
        _cell_text(cells[1], (f.get("control_name") or "")[:80],    size_pt=9)
        _cell_text(cells[2], colour["label"],                        size_pt=9, bold=True, colour=colour["fg"])
        _set_cell_bg(cells[2], colour["bg"])
        _cell_text(cells[3], (f.get("current_state") or "")[:200],  size_pt=9)
        _cell_text(cells[4], (f.get("required_state") or "")[:150], size_pt=9)
        _cell_text(cells[5], f.get("recommendation") or "",          size_pt=9)

    doc.add_paragraph()


# ── Gap/Non-Conformity register (from Gap DB rows) ───────────────────────────

def _add_gap_register(doc: Document, report: Report, service_type: str):
    gaps = list(report.gaps.select_related("requirement").all())
    if not gaps:
        return

    is_gap = service_type == "gap_assessment"
    register_title = "Gap Findings Register" if is_gap else "Non-Conformity & Gap Register"
    _add_heading(doc, register_title, level=1)

    col_headers = (
        ["Ref", "Control Area", "Gap Description", "CIRC Rating", "Priority"]
        if is_gap
        else ["Ref", "Requirement", "Finding", "Audit Rating", "Severity"]
    )

    tbl = doc.add_table(rows=len(gaps) + 1, cols=len(col_headers))
    tbl.style = "Light Shading"
    _header_row(tbl, col_headers)

    for row_idx, gap in enumerate(gaps, start=1):
        rating = gap.rating or infer_rating(gap.severity, "non_compliant", service_type)
        colour = get_colour(rating, service_type)
        cells = tbl.rows[row_idx].cells

        if is_gap:
            values = [
                gap.requirement.code,
                gap.requirement.text[:70],
                gap.issue,
                colour["label"],
                gap.severity.capitalize(),
            ]
        else:
            values = [
                gap.requirement.code,
                gap.requirement.text[:70],
                gap.issue,
                colour["label"],
                gap.severity.upper(),
            ]

        for ci, val in enumerate(values):
            _cell_text(cells[ci], val, size_pt=9,
                       bold=(ci == 3),
                       colour=(colour["fg"] if ci == 3 else None))
        _set_cell_bg(cells[3], colour["bg"])

    doc.add_paragraph()


# ── Main builder ──────────────────────────────────────────────────────────────

def build_docx(report: Report) -> bytes:
    doc = Document()
    service_type = getattr(report, "service_type", "audit_report") or "audit_report"
    is_gap = service_type == "gap_assessment"
    # Per-report logo takes precedence; fall back to project-level logo
    logo = getattr(report, "logo", None) or (
        getattr(report.project, "logo", None) if report.project_id else None
    )

    # Page margins
    for sect in doc.sections:
        sect.top_margin    = Cm(2.0)
        sect.bottom_margin = Cm(2.0)
        sect.left_margin   = Cm(2.5)
        sect.right_margin  = Cm(2.5)

    # ── Cover ──────────────────────────────────────────────────────────────
    _add_cover(doc, report, is_gap, logo=logo)

    # ── Document information table ─────────────────────────────────────────
    _add_doc_info_table(doc, report)
    doc.add_page_break()

    # ── Table of contents ──────────────────────────────────────────────────
    _add_toc(doc, report, is_gap)

    # ── Report sections ────────────────────────────────────────────────────
    sections = list(report.sections.order_by("order"))

    # Collect all findings across clause sections (for consolidated summary)
    all_clause_findings: list[dict] = []

    if is_gap:
        # ── Gap Assessment path ────────────────────────────────────────────
        # Score summary + legend first, then prose sections, then gap register
        _add_score_summary(doc, report)
        _add_legend(doc, service_type)
        doc.add_paragraph()

        for sec in sections:
            content = sec.content or ""
            if content.startswith(JSON_PREFIX):
                raw_json = content[len(JSON_PREFIX):]
                try:
                    findings = json.loads(raw_json)
                    if isinstance(findings, list) and findings:
                        _add_gap_findings_table(doc, sec.section_name, findings)
                        continue
                except json.JSONDecodeError:
                    logger.warning("DOCX: Failed to parse JSON for section '%s'.", sec.section_name)
            _add_prose_section(doc, sec.section_name, content)

        _add_gap_register(doc, report, service_type)

    else:
        # ── Audit Report path ──────────────────────────────────────────────
        # 1. Executive Summary (prose only — first section with that name)
        # 2. Audit Details block §2.0–§2.6 (includes Scope text extracted from sections)
        # 3. Clause finding sections in order
        # 4. Consolidated Findings
        # 5. Audit Conclusions

        # Extract prose from named sections before rendering
        exec_summary_content = ""
        scope_content = ""
        clause_sections = []
        conclusion_content = ""

        for sec in sections:
            name_lower = sec.section_name.lower()
            if "executive summary" in name_lower:
                exec_summary_content = sec.content or ""
            elif "scope" in name_lower and not (sec.content or "").startswith(JSON_PREFIX):
                scope_content = sec.content or ""
            elif "conclusion" in name_lower:
                conclusion_content = sec.content or ""
            else:
                clause_sections.append(sec)

        # 1. Executive Summary
        if exec_summary_content:
            _add_prose_section(doc, "1.0  Executive Summary", exec_summary_content)
            doc.add_page_break()

        # 2. Audit Details §2.0–§2.6
        _add_audit_details(doc, report, scope_content)

        # 3. Clause finding sections
        section_num = 3
        for sec in clause_sections:
            content = sec.content or ""
            sec_label = f"{section_num}.0  {sec.section_name}"

            if content.startswith(JSON_PREFIX):
                raw_json = content[len(JSON_PREFIX):]
                try:
                    findings = json.loads(raw_json)
                    if isinstance(findings, list) and findings:
                        all_clause_findings.extend(findings)
                        _add_audit_findings_table(doc, sec_label, findings)
                        section_num += 1
                        continue
                except json.JSONDecodeError:
                    logger.warning("DOCX: Failed to parse JSON for section '%s'.", sec.section_name)

            _add_prose_section(doc, sec_label, content)
            section_num += 1

        doc.add_page_break()

        # 4. Consolidated Findings
        _add_consolidated_findings(doc, all_clause_findings)
        doc.add_page_break()

        # 5. Audit Conclusions
        _add_audit_conclusions(doc)

        # Append written conclusion prose if present
        if conclusion_content:
            doc.add_paragraph()
            for line in conclusion_content.split("\n"):
                line = _sanitise(line.strip())
                if not line:
                    continue
                p = doc.add_paragraph()
                r = p.add_run(line)
                _style_run(r, size_pt=10)

    # ── Apply logo to headers ──────────────────────────────────────────────
    if logo:
        if logo.placement == "every_page":
            _apply_header_logo(doc, logo)
        elif logo.placement == "selected_pages":
            _apply_header_logo_selected(doc, logo)
        # cover_only: logo is already embedded inline via _add_cover

    # ── Serialise ─────────────────────────────────────────────────────────
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()
