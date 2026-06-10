"""
Build the RAG vector index from the seeded ISO 27001 requirements.

Reads every Requirement row (already loaded by seed_iso27001), formats
each one as a text chunk, embeds it with the local ONNX model, and stores
the result as RAGChunk rows.  Idempotent — skips if the index already
exists; use --force to rebuild.

Usage:
    python manage.py build_rag_index
    python manage.py build_rag_index --force
"""
import logging

from django.core.management.base import BaseCommand

from agents.models import RAGChunk, RAGDocument
from agents.rag.embedder import embed
from reports.models import Requirement

logger = logging.getLogger(__name__)

DOC_NAME = "ISO 27001:2022 Requirements Index"
BATCH_SIZE = 32

# Maps clause-code prefix → semantic theme (mirrors ingestor._27001_theme)
_THEME_MAP = [
    ("A.8", "Technology"),
    ("A.7", "Physical"),
    ("A.6", "People"),
    ("A.5", "Organizational"),
    ("10",  "Improvement"),
    ("9",   "Performance"),
    ("8",   "Operation"),
    ("7",   "Support"),
    ("6",   "Planning"),
    ("5",   "Leadership"),
    ("4",   "Context"),
]


def _theme(code: str) -> str:
    for prefix, label in _THEME_MAP:
        if code.startswith(prefix):
            return label
    return "General"


def _chunk_text(req) -> str:
    parts = [f"{req.code} — {req.clause.title}", req.text]
    if req.action:
        parts.append(f"Action: {req.action}")
    if req.expected_evidence:
        parts.append(f"Evidence: {req.expected_evidence}")
    return "\n".join(parts)


class Command(BaseCommand):
    help = "Build the RAG vector index from the seeded ISO 27001 requirements"

    def add_arguments(self, parser):
        parser.add_argument(
            "--force",
            action="store_true",
            help="Delete and rebuild the index even if it already exists",
        )

    def handle(self, *args, **options):
        # ── Idempotency check ─────────────────────────────────────────────────
        if not options["force"] and RAGDocument.objects.filter(name=DOC_NAME).exists():
            doc = RAGDocument.objects.get(name=DOC_NAME)
            self.stdout.write(
                f"RAG index already exists ({doc.total_chunks} chunks). "
                "Use --force to rebuild."
            )
            return

        RAGDocument.objects.filter(name=DOC_NAME).delete()

        # ── Load requirements ─────────────────────────────────────────────────
        requirements = list(
            Requirement.objects.select_related("clause")
            .order_by("clause__order", "order")
        )
        if not requirements:
            self.stdout.write(
                self.style.WARNING(
                    "No requirements found — run seed_iso27001 first."
                )
            )
            return

        doc = RAGDocument.objects.create(
            name=DOC_NAME,
            doc_type="standard",
            standard_ref="ISO 27001:2022",
            file_path="__requirements_fixture__",
        )

        # ── Build text list ───────────────────────────────────────────────────
        texts = [_chunk_text(r) for r in requirements]

        # ── Embed in batches, bulk-create chunks ──────────────────────────────
        chunks_to_create = []
        for batch_start in range(0, len(texts), BATCH_SIZE):
            batch_texts = texts[batch_start : batch_start + BATCH_SIZE]
            batch_reqs  = requirements[batch_start : batch_start + BATCH_SIZE]
            try:
                embeddings = embed(batch_texts)
            except Exception as exc:
                logger.error("Embedding batch %d failed: %s", batch_start, exc)
                doc.delete()
                self.stdout.write(
                    self.style.ERROR(f"Embedding failed: {exc}")
                )
                return

            for i, (req, vec) in enumerate(zip(batch_reqs, embeddings)):
                chunks_to_create.append(
                    RAGChunk(
                        document=doc,
                        chunk_index=batch_start + i,
                        content=batch_texts[i],
                        clause_ref=req.code,
                        section_title=req.clause.title[:255],
                        theme=_theme(req.code),
                        page_start=0,
                        page_end=0,
                        embedding=vec.tolist(),
                    )
                )

        RAGChunk.objects.bulk_create(chunks_to_create)
        doc.total_chunks = len(chunks_to_create)
        doc.save(update_fields=["total_chunks"])

        self.stdout.write(
            self.style.SUCCESS(
                f"RAG index built: {len(chunks_to_create)} chunks "
                f"from {len(requirements)} requirements."
            )
        )
