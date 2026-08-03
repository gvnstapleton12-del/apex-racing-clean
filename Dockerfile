FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev || npm install --omit=dev

COPY . .
RUN npm run build

EXPOSE 3000

ENV NODE_ENV=production
ENV NODE_OPTIONS="--dns-result-order=ipv4first --max-old-space-size=6144"

CMD ["node", "server.js"]
