from .base import *  # noqa: F403

DEBUG = True
ALLOWED_HOSTS = ["localhost", "127.0.0.1"]

# Local ONNX model path (for dev — run scripts/download_models.py once)
MODELS_DIR = BASE_DIR / "models" / "minilm"  # noqa: F405

