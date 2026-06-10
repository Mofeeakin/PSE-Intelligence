from reports.models import Report, ComplianceScore


class ScoringService:
    """
    Weighted compliance score calculation.

    section_score    = 100 − (high_gaps × 10),  clamped 0–100
    evidence_score   = 100 − (total_gaps × 8),   clamped 0–100
    consistency_score = 95 (no gaps) | 88 (has gaps)
    total            = section×0.40 + evidence×0.35 + consistency×0.25

    Status:
      ≥ 85  → APPROVED
      60–84 → APPROVED_WITH_GAPS
      < 60  → FAILED
    """

    def run(self, report: Report) -> ComplianceScore:
        gaps = list(report.gaps.all())
        high_gaps = sum(1 for g in gaps if g.severity == "high")
        total_gaps = len(gaps)

        section_score = max(0.0, min(100.0, 100.0 - high_gaps * 10))
        evidence_score = max(0.0, min(100.0, 100.0 - total_gaps * 8))
        consistency_score = 95.0 if total_gaps == 0 else 88.0

        total = (
            section_score * 0.40
            + evidence_score * 0.35
            + consistency_score * 0.25
        )
        total = round(total, 2)

        if total >= 85:
            status = ComplianceScore.STATUS_APPROVED
        elif total >= 60:
            status = ComplianceScore.STATUS_APPROVED_WITH_GAPS
        else:
            status = ComplianceScore.STATUS_FAILED

        score, _ = ComplianceScore.objects.update_or_create(
            report=report,
            defaults={
                "section_score": section_score,
                "evidence_score": evidence_score,
                "consistency_score": consistency_score,
                "total_score": total,
                "status": status,
            },
        )
        return score
