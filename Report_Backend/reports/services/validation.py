from reports.models import Report, Gap, ValidationResult, Submission, Evidence, Requirement
from exports.colour_map import infer_rating


class ValidationService:
    """
    Deterministic rule-based validation engine.

    Rules:
    1. Mandatory requirement with no evidence attached → GAP (HIGH)
    2. Mandatory requirement with compliance_status != compliant → GAP (HIGH)
    3. Partial compliance with no explanatory comment → GAP (MEDIUM)

    Each gap is also assigned a service-type-aware `rating` for colour coding:
      Audit:  conformity | observation | minor_nc | major_nc
      Gap:    fully_implemented | partially_implemented | not_implemented | not_applicable
    """

    def run(self, report: Report) -> ValidationResult:
        # Clear old gaps for this report before re-validating
        report.gaps.all().delete()

        submissions = list(
            report.submissions.select_related("requirement").all()
        )
        evidence_count = report.evidence.count()
        service_type = getattr(report, "service_type", "audit_report") or "audit_report"
        gaps_created = []

        for sub in submissions:
            req = sub.requirement

            if req.tag == Requirement.TAG_MANDATORY:
                # Rule 1: mandatory with zero evidence
                if evidence_count == 0:
                    severity = Gap.SEVERITY_HIGH
                    gap = Gap.objects.create(
                        report=report,
                        requirement=req,
                        issue=f"No evidence uploaded for mandatory requirement {req.code}.",
                        severity=severity,
                        rating=infer_rating(severity, sub.compliance_status, service_type),
                    )
                    gaps_created.append(gap)
                    continue

                # Rule 2: mandatory but not compliant
                if sub.compliance_status != Submission.COMPLIANCE_COMPLIANT:
                    severity = Gap.SEVERITY_HIGH
                    gap = Gap.objects.create(
                        report=report,
                        requirement=req,
                        issue=(
                            f"Mandatory requirement {req.code} is marked "
                            f"'{sub.get_compliance_status_display()}' — must be Compliant."
                        ),
                        severity=severity,
                        rating=infer_rating(severity, sub.compliance_status, service_type),
                    )
                    gaps_created.append(gap)

            # Rule 3: partial with no comment
            if sub.compliance_status == Submission.COMPLIANCE_PARTIAL and not sub.comment.strip():
                severity = Gap.SEVERITY_MEDIUM
                gap = Gap.objects.create(
                    report=report,
                    requirement=req,
                    issue=(
                        f"Requirement {req.code} is partially compliant but no "
                        f"explanatory comment was provided."
                    ),
                    severity=severity,
                    rating=infer_rating(severity, sub.compliance_status, service_type),
                )
                gaps_created.append(gap)

        is_valid = len(gaps_created) == 0

        # Upsert ValidationResult
        result, _ = ValidationResult.objects.update_or_create(
            report=report,
            defaults={"is_valid": is_valid},
        )
        return result
