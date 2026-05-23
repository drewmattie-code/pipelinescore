# PipelineScore API — Express + better-sqlite3 + tsx.
#
# Single-stage build: install deps + copy source + run via tsx. We don't
# pre-compile to JS because better-sqlite3 needs the host's node-gyp toolchain
# anyway, and tsx-on-Node has negligible runtime cost for this workload.
#
# Persistent disk mounts at /data — adjust the SQLite path via DB_DIR env if
# the host (Render / Fly / Railway) uses a different mount point.

FROM node:22-bookworm-slim

# better-sqlite3 builds a native binding; needs python + build tools at install
# time. We drop them after build to keep the image small.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 build-essential ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Layer 1: dependencies (cached unless package.json changes)
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --include=dev

# Layer 2: source + benchmarks
COPY backend ./
COPY benchmarks /benchmarks

# Trim the build toolchain now that better-sqlite3 is compiled
RUN apt-get purge -y --auto-remove python3 build-essential

# The benchmarks dir is loaded by seed.ts via a relative path. Symlink so the
# path inside the image matches the repo layout.
RUN ln -s /benchmarks /benchmarks-link && \
    mkdir -p .data && \
    chown -R node:node /app /benchmarks

ENV NODE_ENV=production
ENV PORT=4601
EXPOSE 4601

# Persistent data dir — Render disk mounts here. Override via env if needed.
ENV DB_DIR=/data

USER node

# tsx run, not watch — production runs the entry point directly
CMD ["node", "node_modules/.bin/tsx", "src/server.ts"]
