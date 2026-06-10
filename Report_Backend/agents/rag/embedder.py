"""
ONNX-based sentence embedding using all-MiniLM-L6-v2.

Architecture:
  - Model: sentence-transformers/all-MiniLM-L6-v2 (ONNX export)
  - Tokeniser: HuggingFace tokenizers library (Rust, no PyTorch)
  - Pooling: mean pooling over non-padding tokens
  - Output: L2-normalised 384-dimensional float32 vector

Model is loaded from settings.MODELS_DIR at first call and cached for the
lifetime of the process (singleton via module-level variable).

Dev setup: run `python scripts/download_models.py` once before use.
Docker: model is baked into the image at build time — no download needed.
"""
from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import List

import numpy as np

logger = logging.getLogger(__name__)

# ── Module-level singletons (lazy-loaded on first embed call) ─────────────────
_session = None   # onnxruntime.InferenceSession
_tokenizer = None  # tokenizers.Tokenizer

EMBEDDING_DIM = 384


def _models_dir() -> Path:
    """Return the path to the baked-in ONNX model directory."""
    try:
        from django.conf import settings
        return Path(settings.MODELS_DIR)
    except Exception:
        # Fallback for scripts run outside Django
        return Path(__file__).resolve().parents[2] / "models" / "minilm"


def _ensure_downloaded(models_dir: Path) -> None:
    """Download model files from HuggingFace if not already present (dev only)."""
    onnx_path = models_dir / "onnx" / "model.onnx"
    tok_path = models_dir / "tokenizer.json"

    if onnx_path.exists() and tok_path.exists():
        return

    logger.info("ONNX model not found at %s — downloading from HuggingFace...", models_dir)
    import urllib.request

    HF_BASE = "https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2/resolve/main"
    files = {
        onnx_path: f"{HF_BASE}/onnx/model.onnx",
        tok_path: f"{HF_BASE}/tokenizer.json",
        models_dir / "tokenizer_config.json": f"{HF_BASE}/tokenizer_config.json",
    }

    for dest, url in files.items():
        dest.parent.mkdir(parents=True, exist_ok=True)
        if not dest.exists():
            logger.info("  Downloading %s ...", dest.name)
            urllib.request.urlretrieve(url, dest)  # nosec B310 — HF HTTPS only

    logger.info("Model download complete.")


def _load() -> None:
    """Load ONNX session and tokenizer into module globals (called once)."""
    global _session, _tokenizer

    if _session is not None:
        return

    try:
        import onnxruntime as ort
        from tokenizers import Tokenizer
    except ImportError as exc:
        raise RuntimeError(
            "onnxruntime and tokenizers must be installed: "
            "pip install onnxruntime tokenizers"
        ) from exc

    models_dir = _models_dir()
    _ensure_downloaded(models_dir)

    onnx_path = str(models_dir / "onnx" / "model.onnx")
    tok_path = str(models_dir / "tokenizer.json")

    logger.info("Loading ONNX session from %s", onnx_path)
    sess_opts = ort.SessionOptions()
    sess_opts.inter_op_num_threads = 4
    sess_opts.intra_op_num_threads = 4
    _session = ort.InferenceSession(
        onnx_path,
        sess_options=sess_opts,
        providers=["CPUExecutionProvider"],
    )

    logger.info("Loading tokenizer from %s", tok_path)
    _tokenizer = Tokenizer.from_file(tok_path)
    _tokenizer.enable_padding(pad_id=0, pad_token="[PAD]", length=128)
    _tokenizer.enable_truncation(max_length=128)

    logger.info("Embedder ready (dim=%d).", EMBEDDING_DIM)


def _mean_pool(token_embeddings: np.ndarray, attention_mask: np.ndarray) -> np.ndarray:
    """
    Mean pool token embeddings weighted by attention mask.

    token_embeddings : (batch, seq_len, hidden)
    attention_mask   : (batch, seq_len)
    returns          : (batch, hidden)
    """
    mask = attention_mask[:, :, np.newaxis].astype(np.float32)
    summed = (token_embeddings * mask).sum(axis=1)
    counts = mask.sum(axis=1).clip(min=1e-9)
    return summed / counts


def _l2_normalize(vectors: np.ndarray) -> np.ndarray:
    """Row-wise L2 normalisation."""
    norms = np.linalg.norm(vectors, axis=1, keepdims=True).clip(min=1e-12)
    return vectors / norms


def embed(texts: List[str]) -> np.ndarray:
    """
    Embed a list of strings. Returns float32 array of shape (len(texts), 384).

    The returned vectors are L2-normalised so cosine similarity == dot product.
    """
    if not texts:
        return np.empty((0, EMBEDDING_DIM), dtype=np.float32)

    _load()

    encodings = _tokenizer.encode_batch(texts)

    input_ids = np.array([e.ids for e in encodings], dtype=np.int64)
    attention_mask = np.array([e.attention_mask for e in encodings], dtype=np.int64)
    token_type_ids = np.zeros_like(input_ids, dtype=np.int64)

    outputs = _session.run(
        None,
        {
            "input_ids": input_ids,
            "attention_mask": attention_mask,
            "token_type_ids": token_type_ids,
        },
    )

    # outputs[0] is last_hidden_state: (batch, seq_len, 384)
    token_embeddings = outputs[0]
    pooled = _mean_pool(token_embeddings, attention_mask)
    return _l2_normalize(pooled).astype(np.float32)


def embed_one(text: str) -> np.ndarray:
    """Convenience wrapper — embed a single string, return 1-D array (384,)."""
    return embed([text])[0]
