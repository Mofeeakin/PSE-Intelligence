"""
Vector similarity retriever using pgvector cosine distance.

Public API
----------
retrieve(query, k=5, standard_ref=None, theme=None) → list[RetrievedChunk]
retrieve_for_clause(clause_refs, k=3) → list[RetrievedChunk]

RetrievedChunk is a lightweight dataclass — safe to pass across module
boundaries without triggering Django model imports.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import List, Optional

logger = logging.getLogger(__name__)

VECTOR_STORE_AVAILABLE = True  # flipped to False if pgvector query fails


@dataclass
class RetrievedChunk:
    """A retrieved knowledge chunk with its similarity score and metadata."""
    chunk_id: int
    content: str
    clause_ref: str
    section_title: str
    theme: str
    standard_ref: str
    similarity: float  # 1.0 = identical, 0.0 = orthogonal


def retrieve(
    query: str,
    k: int = 5,
    standard_ref: Optional[str] = None,
    theme: Optional[str] = None,
    doc_type: Optional[str] = None,
) -> List[RetrievedChunk]:
    """
    Embed `query` and return the top-k most similar RAGChunks.

    Filtering:
        standard_ref — e.g. "ISO 27001:2022" or "ISO 27002:2022"
        theme        — e.g. "Planning", "Organizational", "Technology"
        doc_type     — e.g. "standard", "soa"

    Returns an empty list (silently) if the vector store is not yet
    populated or if the embedder is unavailable — the pipeline will
    fall back to ungrounded generation gracefully.
    """
    global VECTOR_STORE_AVAILABLE

    try:
        from pgvector.django import CosineDistance
        from agents.models import RAGChunk
        from agents.rag.embedder import embed_one
    except Exception as exc:
        logger.warning("Retriever: dependencies not available — %s", exc)
        return []

    try:
        query_vec = embed_one(query).tolist()
    except Exception as exc:
        logger.warning("Retriever: embedding failed — %s", exc)
        return []

    try:
        qs = RAGChunk.objects.select_related("document").filter(
            embedding__isnull=False
        )
        if standard_ref:
            qs = qs.filter(document__standard_ref=standard_ref)
        if theme:
            qs = qs.filter(theme=theme)
        if doc_type:
            qs = qs.filter(document__doc_type=doc_type)

        results = (
            qs.annotate(distance=CosineDistance("embedding", query_vec))
            .order_by("distance")[:k]
        )

        chunks = []
        for row in results:
            chunks.append(RetrievedChunk(
                chunk_id=row.pk,
                content=row.content,
                clause_ref=row.clause_ref,
                section_title=row.section_title,
                theme=row.theme,
                standard_ref=row.document.standard_ref,
                similarity=round(1.0 - float(row.distance), 4),
            ))

        VECTOR_STORE_AVAILABLE = True
        return chunks

    except Exception as exc:
        logger.warning("Retriever: pgvector query failed — %s", exc)
        VECTOR_STORE_AVAILABLE = False
        return []


def retrieve_for_clause(
    clause_refs: List[str],
    k: int = 3,
) -> List[RetrievedChunk]:
    """
    Retrieve chunks that directly match specific ISO clause/control references.

    Used to pull guidance for exact control IDs found in gap submissions
    (e.g. ["5.15", "8.2", "A.9.1"]).
    """
    if not clause_refs:
        return []

    try:
        from agents.models import RAGChunk
    except Exception:
        return []

    try:
        rows = (
            RAGChunk.objects
            .select_related("document")
            .filter(clause_ref__in=clause_refs, embedding__isnull=False)
            .order_by("clause_ref")[:k * len(clause_refs)]
        )
        seen = set()
        results = []
        for row in rows:
            if row.pk not in seen:
                seen.add(row.pk)
                results.append(RetrievedChunk(
                    chunk_id=row.pk,
                    content=row.content,
                    clause_ref=row.clause_ref,
                    section_title=row.section_title,
                    theme=row.theme,
                    standard_ref=row.document.standard_ref,
                    similarity=1.0,  # Exact clause match — treat as perfect
                ))
        return results

    except Exception as exc:
        logger.warning("Retriever: clause lookup failed — %s", exc)
        return []


def retrieve_soa_control(
    control_id: str,
    k: int = 2,
) -> List[RetrievedChunk]:
    """
    Look up the SOA applicability entry for a specific Annex A control.

    Tries an exact clause_ref match first (e.g. "5.15", "8.24").
    Falls back to a semantic search within the SOA doc_type if no exact match.

    Useful for gap analysis: confirms whether a missing control is
    marked as applicable in the organisation's own SOA.
    """
    # Normalise: strip leading "A." for old-style refs (A.5.1 → 5.1)
    normalized = control_id.strip().lstrip("A.") if control_id.startswith("A.") else control_id.strip()

    try:
        from agents.models import RAGChunk
    except Exception:
        return []

    try:
        rows = (
            RAGChunk.objects
            .select_related("document")
            .filter(
                document__doc_type="soa",
                clause_ref=normalized,
                embedding__isnull=False,
            )[:k]
        )
        results = [
            RetrievedChunk(
                chunk_id=row.pk,
                content=row.content,
                clause_ref=row.clause_ref,
                section_title=row.section_title,
                theme=row.theme,
                standard_ref=row.document.standard_ref,
                similarity=1.0,
            )
            for row in rows
        ]
        if results:
            return results

        # Fallback: semantic search restricted to SOA documents
        return retrieve(
            query=f"control {control_id} applicability justification",
            k=k,
            doc_type="soa",
        )

    except Exception as exc:
        logger.warning("Retriever: SOA lookup failed for %s — %s", control_id, exc)
        return []


def format_context(chunks: List[RetrievedChunk], max_chars: int = 3000) -> str:
    """
    Format a list of RetrievedChunks into a compact context string for injection
    into an LLM prompt. Truncates to max_chars to stay within token budgets.
    """
    if not chunks:
        return ""

    lines = []
    total = 0
    for chunk in chunks:
        header = f"[{chunk.standard_ref} Clause {chunk.clause_ref} — {chunk.section_title}]"
        block = f"{header}\n{chunk.content}"
        if total + len(block) > max_chars:
            remaining = max_chars - total - len(header) - 10
            if remaining > 100:
                block = f"{header}\n{chunk.content[:remaining]}..."
            else:
                break
        lines.append(block)
        total += len(block)

    return "\n\n".join(lines)


# ── Hybrid retrieval (BM25 + vector + RRF) ───────────────────────────────────

def _bm25_search(
    query: str,
    clause_refs: List[str] = None,
    standard_ref: Optional[str] = None,
    k: int = 10,
) -> List[RetrievedChunk]:
    """PostgreSQL full-text search providing BM25-style keyword retrieval."""
    try:
        from agents.models import RAGChunk
        from django.contrib.postgres.search import SearchVector, SearchQuery, SearchRank
    except Exception as exc:
        logger.debug("BM25: dependencies not available — %s", exc)
        return []

    try:
        qs = RAGChunk.objects.select_related("document")
        if standard_ref:
            qs = qs.filter(document__standard_ref=standard_ref)
        if clause_refs:
            qs = qs.filter(clause_ref__in=clause_refs)

        search_query = SearchQuery(query, config="english")
        results = (
            qs.annotate(
                rank=SearchRank(
                    SearchVector("content", config="english"),
                    search_query,
                )
            )
            .filter(rank__gt=0.0)
            .order_by("-rank")[:k]
        )

        chunks = []
        for row in results:
            chunks.append(RetrievedChunk(
                chunk_id=row.pk,
                content=row.content,
                clause_ref=row.clause_ref,
                section_title=row.section_title,
                theme=row.theme,
                standard_ref=row.document.standard_ref,
                similarity=round(float(row.rank), 4),
            ))
        return chunks
    except Exception as exc:
        logger.warning("Retriever: BM25 search failed — %s", exc)
        return []


def retrieve_hybrid(
    query: str,
    clause_refs: List[str] = None,
    k: int = 5,
    standard_ref: Optional[str] = None,
) -> List[RetrievedChunk]:
    """
    Hybrid BM25 + vector retrieval with Reciprocal Rank Fusion (RRF).

    Combines:
      - Semantic vector leg (cosine similarity via pgvector)
      - Keyword leg (PostgreSQL full-text search — BM25-style)

    Merged via RRF: score = 1/(60+rank_vector) + 1/(60+rank_keyword)
    Falls back to pure vector if BM25 returns no results.
    """
    # ── Vector leg ─────────────────────────────────────────────────────────
    vector_results = retrieve(query, k=k * 2, standard_ref=standard_ref)

    # Prioritise clause-matched chunks within vector results
    if clause_refs:
        matched = [c for c in vector_results if c.clause_ref in clause_refs]
        unmatched = [c for c in vector_results if c.clause_ref not in clause_refs]
        if matched:
            vector_results = matched + unmatched

    # ── Keyword leg ─────────────────────────────────────────────────────────
    keyword_results = _bm25_search(
        query, clause_refs=clause_refs, standard_ref=standard_ref, k=k * 2
    )

    if not keyword_results:
        return vector_results[:k]

    # ── Reciprocal Rank Fusion ───────────────────────────────────────────────
    K_RRF = 60
    scores: dict[int, float] = {}
    for rank, chunk in enumerate(vector_results):
        scores[chunk.chunk_id] = scores.get(chunk.chunk_id, 0.0) + 1.0 / (K_RRF + rank + 1)
    for rank, chunk in enumerate(keyword_results):
        scores[chunk.chunk_id] = scores.get(chunk.chunk_id, 0.0) + 1.0 / (K_RRF + rank + 1)

    # Deduplicate and rank by fused score
    seen: dict[int, RetrievedChunk] = {}
    for c in vector_results + keyword_results:
        if c.chunk_id not in seen:
            seen[c.chunk_id] = c

    ranked = sorted(seen.values(), key=lambda c: scores.get(c.chunk_id, 0.0), reverse=True)
    return ranked[:k]
