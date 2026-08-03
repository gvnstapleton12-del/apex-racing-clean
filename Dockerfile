FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y python3 build-essential && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
RUN npm rebuild sqlite3

COPY . .
RUN npm run build

EXPOSE 3000

ENV NODE_ENV=production
ENV NODE_OPTIONS="--dns-result-order=ipv4first --max-old-space-size=6144"

CMD ["node", "server.js"]
