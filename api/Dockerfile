# Image production cho api (FastAPI). Build context là thư mục api/:
#   docker build -t okia-api api
# Postgres/Redis KHÔNG nằm trong image: truyền DATABASE_URL, REDIS_URL... khi chạy container.
# Khởi động: alembic upgrade head rồi uvicorn 1 worker (docs/02, docs/09 P1-21).

FROM python:3.13-slim
COPY --from=ghcr.io/astral-sh/uv:0.12.10 /uv /uvx /bin/
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    PYTHONUNBUFFERED=1
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY . .
RUN uv sync --frozen --no-dev
ENV PATH="/app/.venv/bin:$PATH" \
    ENV=production \
    WEB_CONCURRENCY=2
RUN useradd --system --uid 10001 okia
USER okia
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/healthz', timeout=4).status == 200 else 1)"
# uvicorn lấy số worker từ WEB_CONCURRENCY (ghi đè bằng biến môi trường lúc deploy). Hub dùng Redis
# pub/sub, timer/ghép trận có khóa Redis nên nhiều tiến trình chạy song song được (docs/02 — Tải).
# --ws-max-size 64 KB: tin của client chỉ vài trăm byte; chặn frame lớn ngay ở tầng giao thức.
CMD ["sh", "-c", "alembic upgrade head && exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips='*' --ws-max-size 65536"]
