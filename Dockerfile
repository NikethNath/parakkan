# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim

# Chromium for the CRIS auto-fetch (Playwright drives it via CHROME_PATH).
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      chromium ca-certificates fonts-liberation \
 && rm -rf /var/lib/apt/lists/*

ENV NEXT_TELEMETRY_DISABLED=1 \
    CHROME_PATH=/usr/bin/chromium

WORKDIR /app

# Install ALL deps (dev deps are needed to build and to run prisma/tsx at start).
COPY package.json package-lock.json* ./
RUN npm ci

# Build the app (package.json "build" runs `prisma generate && next build`).
COPY . .
RUN npm run build

EXPOSE 3000
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["npm", "run", "start"]
