from .base import *  # noqa: F403
from pathlib import Path
import os

DEBUG = False
ALLOWED_HOSTS = ["*"]  # Restrict via reverse proxy / load balancer in production

# WhiteNoise serves compressed static files from Gunicorn — no separate static server needed
MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

STATICFILES_STORAGE = "whitenoise.storage.CompressedManifestStaticFilesStorage"

# Serve the built Vite SPA from spa_dist/ at root (e.g. /, /login, /wizard)
WHITENOISE_ROOT = str(BASE_DIR / "spa_dist")  # noqa: F405
WHITENOISE_MAX_AGE = 31536000  # 1 year cache for hashed Vite assets

# Path to ONNX model baked into the Docker image at build time
MODELS_DIR = BASE_DIR / "models" / "minilm"  # noqa: F405

