FROM node:20-bookworm-slim

RUN apt-get update && apt-get install -y \
    python3 python3-pip \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

RUN pip3 install --break-system-packages rpscrape 2>/dev/null || true

RUN corepack enable && corepack prepare pnpm@10.33.4 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile || pnpm install
RUN pnpm rebuild sqlite3 2>/dev/null || true

COPY . .
RUN npx vite build

EXPOSE 3000

ENV NODE_ENV=production
ENV NODE_OPTIONS="--dns-result-order=ipv4first --max-old-space-size=6144"

CMD ["node", "server.js"]
