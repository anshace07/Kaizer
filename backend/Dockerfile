# PlantPulse AI backend (FastAPI). Multi-arch base image: works on Apple Silicon (arm64) and Intel (amd64).
# Build context is the REPO ROOT (the app reads ../data), e.g.  docker build -f backend/Dockerfile .
# Secrets are NOT in the image: backend/.env is passed at run time by docker-compose (env_file).
FROM python:3.12-slim

# ffmpeg converts browser recordings (webm) into 16 kHz mono WAV for Gnani Prisma.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PLANTPULSE_DB_PATH=/app/db/plantpulse.db

WORKDIR /app/backend

# Dependencies first (cached between builds). The lock file pins the exact tested versions.
COPY backend/requirements.txt backend/requirements-lock.txt ./
RUN pip install --no-cache-dir -r requirements.txt -c requirements-lock.txt

# App code + synthetic data only. Same layout as the repo: /app/backend/app and /app/data.
COPY data /app/data
COPY backend/app ./app

EXPOSE 8000
# On first start the app creates the SQLite DB on the /app/db volume and loads the synthetic seed data;
# on later starts it upgrades the schema in place (see app/seed.py).
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
