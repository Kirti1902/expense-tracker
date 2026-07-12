# Node LTS. Not slim, since better-sqlite3 needs to compile its native
# binding if no prebuilt binary matches the host platform.
FROM node:20-bookworm-slim

WORKDIR /app

# Build tools for better-sqlite3's native module, in case a prebuilt
# binary isn't available for this platform.
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

ENV PORT=3000
ENV DATA_DIR=/app/data

# Mount a volume at /app/data on your host so expenses.db survives restarts/redeploys.
VOLUME ["/app/data"]

EXPOSE 3000
CMD ["node", "index.js"]
