from django.contrib import admin
from .models import Standard, Clause, Requirement, Report, Submission, Evidence, Gap, ValidationResult, ComplianceScore

admin.site.register(Standard)
admin.site.register(Clause)
admin.site.register(Requirement)
admin.site.register(Report)
admin.site.register(Submission)
admin.site.register(Evidence)
admin.site.register(Gap)
admin.site.register(ValidationResult)
admin.site.register(ComplianceScore)
