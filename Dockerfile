# Build stage
FROM node:18-alpine AS builder

# Install Playwright system dependencies (Alpine package names)
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    freetype-dev \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    libstdc++ \
    glib \
    nspr \
    at-spi2-core \
    cups \
    dbus \
    libdrm \
    libxkbcommon \
    libxcomposite \
    libxdamage \
    libxfixes \
    libxrandr \
    mesa-gbm \
    alsa-lib \
    pango \
    cairo \
    fontconfig \
    harfbuzz \
    gtk+3.0 \
    libxshmfence \
    libxscrnsaver \
    libxtst \
    libffi \
    zlib \
    bzip2 \
    expat \
    libpng \
    libjpeg-turbo \
    libwebp \
    openjpeg \
    woff2 \
    brotli

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Install dependencies
RUN pnpm install --no-frozen-lockfile

# Copy source
COPY . .

# Build
RUN pnpm run build

# Runtime stage
FROM node:18-alpine AS runner

# Install runtime dependencies
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    libstdc++ \
    glib \
    nspr \
    at-spi2-core \
    cups \
    dbus \
    libdrm \
    libxkbcommon \
    libxcomposite \
    libxdamage \
    libxfixes \
    libxrandr \
    mesa-gbm \
    alsa-lib \
    pango \
    cairo \
    fontconfig \
    harfbuzz \
    gtk+3.0 \
    libxshmfence \
    libxscrnsaver \
    libxtst \
    libffi \
    zlib \
    bzip2 \
    expat \
    libpng \
    libjpeg-turbo \
    libwebp \
    openjpeg \
    woff2 \
    brotli

WORKDIR /app

# Copy built assets and dependencies
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/server.js ./
COPY --from=builder /app/src ./src
COPY --from=builder /app/data ./data

# Rebuild sqlite3 native bindings (pnpm symlinks don't survive COPY)
RUN apk add --no-cache python3 make g++ && \
    npm rebuild sqlite3 --build-from-source && \
    apk del python3 make g++

# Create data directory for SQLite
RUN mkdir -p /app/data

# Set Playwright to use system chromium
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium

EXPOSE 8080

CMD ["node", "server.js"]