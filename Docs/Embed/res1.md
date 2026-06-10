Searched for text `embed|embedding|MiniLM|EMBED_URL|HF_TOKEN|sentence_transformer` (`**/backend/src/**`), 20 results

Read [](file:///c%3A/Users/DELL/Desktop/Moe/Chat%20Assisant%20%20placeware%20x1/backend/src/embed_proxy.py#1-1), lines 1 to 115

Read [](file:///c%3A/Users/DELL/Desktop/Moe/Chat%20Assisant%20%20placeware%20x1/backend/src/retrieval.py)

Here's the full embedding architecture:

---

**Stack: 4-piece fully offline RAG pipeline**

| Layer | Technology | Detail |
|---|---|---|
| **Embedding model** | `sentence-transformers/all-MiniLM-L6-v2` | Baked into Docker image at build time (no runtime downloads) |
| **Runtime format** | ONNX + `onnxruntime` | Zero Python framework dependency — just `ort.InferenceSession` |
| **Tokenizer** | HuggingFace `tokenizers` (Rust) | `tokenizer.json` loaded from same model dir, padded/truncated to 128 tokens |
| **Vector store** | Supabase `pgvector` | 384-dim `vector` column; queried via `match_documents` RPC (cosine similarity, threshold 0.78) |

**Data flow:**

```
query → tokenizer.json → ONNX model → mean pool → L2 normalize
      → 384-float list → Supabase RPC match_documents → top-k (question, answer) rows
```

**Key choices to replicate:**
1. `all-MiniLM-L6-v2` exported to ONNX + `tokenizer.json` → both downloaded in a Dockerfile `model_downloader` stage into `src/models/`
2. Module-level singletons (`_session`, `_tokenizer`) — loaded once, shared across uvicorn workers
3. Supabase RPC abstracts away all SQL — your app only calls `.rpc("match_documents", {...})`
4. Validation: reject any embedding that isn't exactly 384 dims before it hits the DB