"""
Management command: ingest_documents

Usage examples
--------------
# Ingest a single PDF
  python manage.py ingest_documents path/to/iso27001.pdf

# Ingest a Statement of Applicability Excel workbook
  python manage.py ingest_documents path/to/soa.xlsx

# Ingest a whole folder (processes all .pdf and .xlsx files)
    python manage.py ingest_documents "Templates/ISO 27001 Docs/SOA"

# Re-ingest (overwrites existing chunks)
  python manage.py ingest_documents path/to/doc.pdf --force

# List all ingested documents
  python manage.py ingest_documents --list
"""
from __future__ import annotations

import logging
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Ingest PDF documents into the RAG vector store."

    def add_arguments(self, parser):
        parser.add_argument(
            "paths",
            nargs="*",
            type=str,
            help="Paths to PDF files or directories containing PDFs.",
        )
        parser.add_argument(
            "--force",
            action="store_true",
            default=False,
            help="Re-ingest documents that already exist in the store.",
        )
        parser.add_argument(
            "--list",
            action="store_true",
            default=False,
            dest="list_docs",
            help="List all ingested documents and exit.",
        )

    def handle(self, *args, **options):
        if options["list_docs"]:
            self._list_documents()
            return

        if not options["paths"]:
            raise CommandError("Provide at least one path to a PDF/XLSX/DOCX or directory.")

        from agents.rag.ingestor import ingest_pdf, ingest_xlsx, ingest_docx

        doc_paths: list[Path] = []
        for raw_path in options["paths"]:
            p = Path(raw_path)
            if not p.exists():
                self.stderr.write(self.style.WARNING(f"  Path not found: {p}"))
                continue
            if p.is_dir():
                found = sorted(p.glob("*.pdf")) + sorted(p.glob("*.xlsx")) + sorted(p.glob("*.docx"))
                if not found:
                    self.stderr.write(self.style.WARNING(f"  No PDF/XLSX/DOCX files found in: {p}"))
                else:
                    doc_paths.extend(found)
            elif p.suffix.lower() in (".pdf", ".xlsx", ".docx"):
                doc_paths.append(p)
            else:
                self.stderr.write(self.style.WARNING(f"  Skipping unsupported file type: {p}"))

        if not doc_paths:
            raise CommandError("No valid PDF, XLSX, or DOCX files found.")

        self.stdout.write(
            self.style.MIGRATE_HEADING(f"Ingesting {len(doc_paths)} document(s)...")
        )

        for doc_path in doc_paths:
            self.stdout.write(f"\n  Processing: {doc_path.name}")
            try:
                if doc_path.suffix.lower() == ".xlsx":
                    doc = ingest_xlsx(str(doc_path), force=options["force"])
                    self.stdout.write(
                        self.style.SUCCESS(
                            f"  ✓ {doc.name!r}  |  {doc.total_pages} sheet(s)  "
                            f"|  {doc.total_chunks} controls  |  {doc.standard_ref}"
                        )
                    )
                elif doc_path.suffix.lower() == ".docx":
                    doc = ingest_docx(str(doc_path), force=options["force"])
                    self.stdout.write(
                        self.style.SUCCESS(
                            f"  ✓ {doc.name!r}  |  {doc.doc_type}  "
                            f"|  {doc.total_pages} section(s)  "
                            f"|  {doc.total_chunks} chunks  |  {doc.standard_ref}"
                        )
                    )
                else:
                    doc = ingest_pdf(str(doc_path), force=options["force"])
                    self.stdout.write(
                        self.style.SUCCESS(
                            f"  ✓ {doc.name!r}  |  {doc.total_pages} pages  "
                            f"|  {doc.total_chunks} chunks  |  {doc.standard_ref}"
                        )
                    )
            except Exception as exc:
                self.stderr.write(
                    self.style.ERROR(f"  ✗ Failed to ingest {doc_path.name}: {exc}")
                )

        self.stdout.write(self.style.SUCCESS("\nIngestion complete."))
    def _list_documents(self):
        from agents.models import RAGDocument

        docs = RAGDocument.objects.all().order_by("ingested_at")
        if not docs.exists():
            self.stdout.write("No documents ingested yet.")
            return

        self.stdout.write(
            self.style.MIGRATE_HEADING(f"{'Name':<40} {'Type':<12} {'Standard':<20} {'Chunks':>7} {'Pages':>6}")
        )
        self.stdout.write("-" * 90)
        for doc in docs:
            self.stdout.write(
                f"{doc.name[:38]:<40} {doc.doc_type:<12} {doc.standard_ref:<20} "
                f"{doc.total_chunks:>7} {doc.total_pages:>6}"
            )
