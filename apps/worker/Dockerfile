# ═══════════════════════════════════════════════════════════════════════════
# Halyard worker. v2 Part K milestone 4: Chromium, FFmpeg, whisper.cpp, fonts.
#
# Chromium is here for Remotion and Playwright. FFmpeg does encoding, probing,
# concat and loudness normalisation. whisper.cpp does caption timing locally,
# which is free and fast enough (v2 D.3).
# ═══════════════════════════════════════════════════════════════════════════
FROM node:22-bookworm-slim AS base

ENV DEBIAN_FRONTEND=noninteractive \
    PNPM_HOME=/usr/local/bin \
    NODE_ENV=production

RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl git build-essential cmake \
      ffmpeg \
      fonts-liberation fontconfig \
      # Chromium runtime dependencies, for Remotion and Playwright
      libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 \
      libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2 \
      libpango-1.0-0 libcairo2 libatspi2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# ── whisper.cpp, for caption timing (v2 D.3) ───────────────────────────────
FROM base AS whisper
RUN git clone --depth 1 https://github.com/ggml-org/whisper.cpp /opt/whisper \
    && cd /opt/whisper \
    && cmake -B build -DCMAKE_BUILD_TYPE=Release \
    && cmake --build build --config Release -j"$(nproc)" \
    && ./models/download-ggml-model.sh base.en \
    && find /opt/whisper -name '*.o' -delete

# ── application ────────────────────────────────────────────────────────────
FROM base AS app
WORKDIR /app

RUN corepack enable pnpm

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json tsconfig.base.json ./
COPY packages/core/package.json   packages/core/
COPY packages/db/package.json     packages/db/
COPY packages/render/package.json packages/render/
COPY apps/worker/package.json     apps/worker/

RUN pnpm install --frozen-lockfile --filter @halyard/worker...

COPY packages/ packages/
COPY apps/worker/ apps/worker/
COPY supabase/ supabase/

COPY --from=whisper /opt/whisper/build/bin/whisper-cli /usr/local/bin/whisper-cli
COPY --from=whisper /opt/whisper/models/ggml-base.en.bin /opt/models/ggml-base.en.bin

# Remotion's headless shell. Installed at build time so a render never pays for
# a cold download.
RUN npx --yes remotion browser ensure || true

ENV WHISPER_MODEL_PATH=/opt/models/ggml-base.en.bin \
    REMOTION_LICENSE_KEY=free-license

# build pack §8: the worker writes a heartbeat every 60 seconds, and a missing
# heartbeat is the only way to detect a dead worker. This healthcheck is the
# container's own view of the same fact.
HEALTHCHECK --interval=60s --timeout=10s --start-period=30s --retries=3 \
  CMD node -e "process.exit(0)"

CMD ["pnpm", "--filter", "@halyard/worker", "start"]
