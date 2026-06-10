# ── Stage 1: Download ONNX model ──────────────────────────────────────────────
FROM alpine:latest AS wget-builder
RUN apk add --no-cache wget ca-certificates
RUN mkdir -p /models/minilm/onnx && \
    wget -q --tries=3 --timeout=60 \
      -O /models/minilm/onnx/model.onnx \
      "https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2/resolve/main/onnx/model.onnx" && \
    wget -q --tries=3 --timeout=30 \
      -O /models/minilm/tokenizer.json \
      "https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2/resolve/main/tokenizer.json" && \
    wget -q --tries=3 --timeout=30 \
      -O /models/minilm/tokenizer_config.json \
      "https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2/resolve/main/tokenizer_config.json"

# ── Stage 2: Build Python dependencies ────────────────────────────────────────
# python:3.12-slim is intentional — onnxruntime requires glibc (manylinux wheels).
# Alpine/musl has zero onnxruntime wheels on PyPI. Do NOT change this to alpine.
# The Docker DX hint on this line is a Hint (severity 4), not a build error.
FROM python:3.12-slim AS python-builder
WORKDIR /app
COPY requirements.txt .
RUN apt-get update \
    && apt-get install -y --no-install-recommends gcc libxml2-dev libxslt-dev \
    && pip install --no-cache-dir --user -r requirements.txt \
    && rm -rf /var/lib/apt/lists/*

# ── Stage 3: Runtime image ─────────────────────────────────────────────────────
# python:3.12-slim is intentional — see note above. gcc never arrives here.
FROM python:3.12-slim AS app
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DJANGO_SETTINGS_MODULE=config.settings.prod
WORKDIR /app
RUN apt-get update \
    && apt-get upgrade -y --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*
COPY --from=python-builder /root/.local /root/.local
ENV PATH=/root/.local/bin:$PATH
COPY . .
COPY --from=wget-builder /models ./models
RUN chmod +x entrypoint.sh
EXPOSE 8000
ENTRYPOINT ["./entrypoint.sh"]
