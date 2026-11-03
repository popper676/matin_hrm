# ─────────────────────────────────────────────────────────────
# Stage 1: Build the React Frontend
# ─────────────────────────────────────────────────────────────
FROM node:24-alpine AS build-frontend

WORKDIR /app/hrm-client

# Install dependencies first (layer-cached if package.json unchanged)
COPY hrm-client/package*.json ./
RUN npm ci --no-audit --no-fund

# Copy source and build
COPY shared/ /app/shared/
COPY hrm-client/ ./

RUN npm run build

# ─────────────────────────────────────────────────────────────
# Stage 2: Production Backend Image
# Uses node:24-slim (not alpine) because Puppeteer/Chromium
# requires glibc which musl-based Alpine does not provide.
# ─────────────────────────────────────────────────────────────
FROM node:24-slim AS production

# ── Puppeteer / Chromium system dependencies ──
# These are the exact packages required for headless Chromium to
# run inside a Linux container (used for PDF generation in boss AI).
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    fonts-noto-core \
    fonts-noto-cjk \
    fonts-sil-padauk \
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libcairo2 \
    libpango-1.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Tell Puppeteer to use system Chromium instead of downloading its own.
# This is the correct pattern for containerized Puppeteer.
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app/server

# Install backend production dependencies only
COPY server/package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# Copy backend source
COPY shared/ /app/shared/
COPY server/ ./

# Copy built frontend from Stage 1
COPY --from=build-frontend /app/hrm-client/dist /app/hrm-client/dist
COPY hrm-client/src/locales/ /app/hrm-client/src/locales/

# Create uploads directory (PDF files written here; should be volume-mounted in production)
RUN mkdir -p /app/server/uploads && chmod 755 /app/server/uploads

# Run as non-root user for security
RUN groupadd -r appuser && useradd -r -m -d /home/appuser -g appuser appuser
RUN chown -R appuser:appuser /app
USER appuser

EXPOSE 8080

# Healthcheck — Docker will mark container unhealthy if /api/health fails
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
    CMD node -e "require('http').get('http://localhost:8080/api/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "index.js"]
