FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    PYTHONDONTWRITEBYTECODE=1 \
    PATH="/opt/yt-dlp/bin:${PATH}"

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates ffmpeg python3 python3-venv \
    && python3 -m venv /opt/yt-dlp \
    && /opt/yt-dlp/bin/pip install --no-cache-dir "yt-dlp[default]==2026.08.19" \
    && apt-get purge -y --auto-remove python3-venv \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY server.cjs supported-sites.txt ./
USER node
EXPOSE 3000
CMD ["node", "server.cjs"]

