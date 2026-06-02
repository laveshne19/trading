# syntax=docker/dockerfile:1
# Multi-stage build for the Zerodha Kite trading system.
# Includes the TA-Lib C library so the indicators use the fast native path.
FROM python:3.11-slim AS base

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

# --- system deps + TA-Lib C library ---
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential wget ca-certificates \
    && wget -q http://prdownloads.sourceforge.net/ta-lib/ta-lib-0.4.0-src.tar.gz \
    && tar -xzf ta-lib-0.4.0-src.tar.gz \
    && cd ta-lib \
    && ./configure --prefix=/usr \
    && make && make install \
    && cd .. && rm -rf ta-lib ta-lib-0.4.0-src.tar.gz \
    && apt-get purge -y --auto-remove wget \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --upgrade pip && pip install -r requirements.txt

COPY . .

# Non-root user for safety.
RUN useradd --create-home trader && chown -R trader:trader /app
USER trader

# Default command runs the trading engine; override for the dashboard.
CMD ["python", "-m", "app.main"]
