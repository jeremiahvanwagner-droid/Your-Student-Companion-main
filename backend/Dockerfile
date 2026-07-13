# YSC FastAPI backend — production image
# Build from repo root:  docker build -t ysc-backend ./backend
# Run locally:           docker run --env-file backend/.env -p 8000:8000 ysc-backend

FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Dependency layer first so code changes don't bust the pip cache
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN useradd --create-home appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

# Container-level liveness; Render/K8s also hit GET /health over HTTP
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import urllib.request,os;urllib.request.urlopen(f\"http://127.0.0.1:{os.getenv('PORT','8000')}/health\")" || exit 1

# Render injects PORT; default to 8000 for local + K8s
CMD ["sh", "-c", "uvicorn server:app --host 0.0.0.0 --port ${PORT:-8000}"]
