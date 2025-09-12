FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8080

# + ffmpeg added here
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg build-essential libpq-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . /app

# Install deps (adjust path if you keep requirements elsewhere)
RUN python -m pip install --upgrade pip setuptools wheel && \
    pip install -r /app/podcast-pro-plus/requirements.txt

ENV PYTHONPATH=/app/podcast-pro-plus

CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8080"]
