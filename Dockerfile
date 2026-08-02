FROM node:20-bookworm-slim

RUN apt-get update && apt-get install -y \
    python3 python3-pip python3-venv \
    git curl build-essential \
    && rm -rf /var/lib/apt/lists/*

RUN pip3 install --break-system-packages rpscrape 2>/dev/null || true

WORKDIR /app

COPY . .
RUN npm install 2>/dev/null || true
RUN npm rebuild sqlite3 2>/dev/null || true
RUN npx vite build 2>/dev/null || true

EXPOSE 3000

ENV NODE_ENV=production
ENV NODE_OPTIONS="--dns-result-order=ipv4first --max-old-space-size=6144"

CMD ["node", "server.js"]
