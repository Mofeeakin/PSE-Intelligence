from django.urls import path
from .views import (
    ReportListCreateView,
    ReportDetailView,
    ReportStatusView,
    EvidenceUploadView,
    RevalidateView,
    RescoreView,
    ClauseListView,
    AgentLogsView,
    ReportAssignView,
    ProjectListCreateView,
    ProjectDetailView,
    ProjectMembersView,
)

urlpatterns = [
    path("reports/",                         ReportListCreateView.as_view(), name="report-list-create"),
    path("reports/<int:pk>/",                ReportDetailView.as_view(),     name="report-detail"),
    path("reports/<int:pk>/status/",         ReportStatusView.as_view(),     name="report-status"),
    path("reports/<int:pk>/evidence/",       EvidenceUploadView.as_view(),   name="report-evidence"),
    path("reports/<int:pk>/validate/",       RevalidateView.as_view(),       name="report-validate"),
    path("reports/<int:pk>/rescore/",        RescoreView.as_view(),          name="report-rescore"),
    path("reports/<int:pk>/logs/",           AgentLogsView.as_view(),        name="report-logs"),
    path("reports/<int:pk>/assign/",         ReportAssignView.as_view(),     name="report-assign"),
    path("clauses/",                         ClauseListView.as_view(),       name="clause-list"),
    path("projects/",                        ProjectListCreateView.as_view(), name="project-list-create"),
    path("projects/<int:pk>/",               ProjectDetailView.as_view(),    name="project-detail"),
    path("projects/<int:pk>/members/",       ProjectMembersView.as_view(),   name="project-members"),
]
