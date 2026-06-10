"""
Colour mapping for compliance ratings in both service types.

Audit report ratings (ISO 27001 internal audit):
  conformity     — fully conforming control           → green
  observation    — noted but not a non-conformity     → blue
  minor_nc       — Minor Non-Conformity               → amber
  major_nc       — Major Non-Conformity               → red

Gap assessment ratings (CIRC Opinion Rating):
  fully_implemented     — control fully in place      → green
  partially_implemented — partially in place          → amber
  not_implemented       — not in place                → red
  not_applicable        — out of scope / excluded     → grey
"""
from __future__ import annotations

# Each entry: hex foreground colour, bg (fill) hex, display label
AUDIT_RATING_COLOURS: dict[str, dict] = {
    "conformity":   {"fg": "276749", "bg": "C6EFD3", "label": "Conformity"},
    "observation":  {"fg": "2C5282", "bg": "D6E8FB", "label": "Observation"},
    "minor_nc":     {"fg": "975A16", "bg": "FFEEBA", "label": "Minor Non-Conformity"},
    "major_nc":     {"fg": "9B2C2C", "bg": "FCDEDE", "label": "Major Non-Conformity"},
}

GAP_RATING_COLOURS: dict[str, dict] = {
    "fully_implemented":     {"fg": "276749", "bg": "C6EFD3", "label": "Fully Implemented"},
    "partially_implemented": {"fg": "975A16", "bg": "FFEEBA", "label": "Partially Implemented"},
    "not_implemented":       {"fg": "9B2C2C", "bg": "FCDEDE", "label": "Not Implemented"},
    "not_applicable":        {"fg": "555555", "bg": "EEEEEE", "label": "Not Applicable"},
}

_FALLBACK = {"fg": "555555", "bg": "F5F5F5", "label": "Unknown"}


def get_colour(rating: str, service_type: str) -> dict:
    """Return the colour dict for a given rating and service type."""
    if service_type == "gap_assessment":
        return GAP_RATING_COLOURS.get(rating, _FALLBACK)
    return AUDIT_RATING_COLOURS.get(rating, _FALLBACK)


def infer_rating(severity: str, compliance_status: str, service_type: str) -> str:
    """
    Derive the appropriate rating from severity + compliance_status + service_type.
    Used when a Gap row has no explicit rating stored yet.
    """
    if service_type == "gap_assessment":
        if compliance_status == "compliant":
            return "fully_implemented"
        if compliance_status == "partial":
            return "partially_implemented"
        return "not_implemented"
    # audit_report
    if compliance_status == "compliant":
        return "conformity"
    if severity == "high":
        return "major_nc"
    if severity == "medium":
        return "minor_nc"
    return "observation"


# ── LLM short-code → rating key mappings ─────────────────────────────────────
# LLM returns status codes like "MaNC", "MiNC", "OBS", "A" (audit)
# or "Fully Implemented", "NI", "PI", "FI" (gap). Normalise to existing keys.

_LLM_AUDIT_STATUS_MAP: dict[str, str] = {
    "A":                     "conformity",
    "OFI":                   "observation",   # OFI treated as observation
    "OBS":                   "observation",
    "MiNC":                  "minor_nc",
    "MaNC":                  "major_nc",
    # Full strings (fallback if LLM doesn't use short codes)
    "Conformity":            "conformity",
    "Agreed":                "conformity",
    "Observation":           "observation",
    "Opportunity for Improvement": "observation",
    "Minor Non-Conformity":  "minor_nc",
    "Major Non-Conformity":  "major_nc",
}

_LLM_GAP_STATUS_MAP: dict[str, str] = {
    "FI":                        "fully_implemented",
    "PI":                        "partially_implemented",
    "NI":                        "not_implemented",
    "NA":                        "not_applicable",
    # Full strings returned by LLM
    "Fully Implemented":         "fully_implemented",
    "Partially Implemented":     "partially_implemented",
    "Not Implemented":           "not_implemented",
    "Not Applicable":            "not_applicable",
}


def get_colour_by_status(status: str, service_type: str) -> dict:
    """
    Get the colour dict for an LLM-returned status string (short code or full string).
    Examples: get_colour_by_status("MaNC", "audit_report")
              get_colour_by_status("Partially Implemented", "gap_assessment")
    """
    if service_type == "gap_assessment":
        rating = _LLM_GAP_STATUS_MAP.get(status, "not_applicable")
    else:
        rating = _LLM_AUDIT_STATUS_MAP.get(status, "observation")
    return get_colour(rating, service_type)
