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
#
# Built statically (`BUILD_SHARED_LIBS=OFF`) so the single copied binary works —
# a dynamically linked whisper-cli needs libwhisper.so alongside it, and copying
# one file out of a build stage is the whole point of doing it in a stage.
#
# ggml's CPU backend uses ARM FP16 vector intrinsics that GCC only accepts when
# the target architecture advertises them. `-DGGML_NATIVE=OFF` stops it probing
# the *build* host (which is wrong under emulation anyway) and the explicit
# armv8.2-a+fp16 baseline is what every Apple silicon and Graviton machine has.
# Without these two flags the arm64 build dies in ggml-cpu/ops.cpp.
FROM base AS whisper
ARG TARGETARCH
RUN set -eux; \
    git clone --depth 1 https://github.com/ggml-org/whisper.cpp /opt/whisper; \
    cd /opt/whisper; \
    if [ "${TARGETARCH}" = "arm64" ]; then \
      EXTRA="-DGGML_NATIVE=OFF -DGGML_CPU_ARM_ARCH=armv8.2-a+fp16"; \
    else \
      EXTRA="-DGGML_NATIVE=OFF"; \
    fi; \
    cmake -B build -DCMAKE_BUILD_TYPE=Release \
      -DBUILD_SHARED_LIBS=OFF \
      -DWHISPER_BUILD_TESTS=OFF -DWHISPER_BUILD_SERVER=OFF ${EXTRA}; \
    cmake --build build --config Release -j"$(nproc)"; \
    ./models/download-ggml-model.sh base.en; \
    find /opt/whisper -name '*.o' -delete

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
COPY scripts/ scripts/

COPY --from=whisper /opt/whisper/build/bin/whisper-cli /usr/local/bin/whisper-cli
COPY --from=whisper /opt/whisper/models/ggml-base.en.bin /opt/models/ggml-base.en.bin

# Remotion's headless shell. Installed at build time so a render never pays for
# a cold download.
RUN npx --yes remotion browser ensure || true

# Playwright's Chromium, which is a different browser from Remotion's and was
# missing entirely.
#
# The apt block above installs Chromium's *runtime dependencies* — libnss3,
# libgbm1 and the rest — which looks like installing Chromium and is not. Every
# capture job on the first deploy died with:
#
#     browserType.launch: Executable doesn't exist at
#     /root/.cache/ms-playwright/chromium_headless_shell-.../chrome-headless-shell
#
# 43 dead jobs before anybody looked. Deliberately not `|| true`: a worker that
# cannot capture should fail to build rather than fail one job at a time in
# production, which is exactly how this went unnoticed.
RUN pnpm --filter @halyard/worker exec playwright install chromium

ENV WHISPER_MODEL_PATH=/opt/models/ggml-base.en.bin \
    REMOTION_LICENSE_KEY=free-license \
    HALYARD_LIVENESS_FILE=/tmp/halyard-worker-alive

# build pack §8: the worker writes a heartbeat every 60 seconds, and a missing
# heartbeat is the only way to detect a dead worker.
#
# This used to run `node -e "process.exit(0)"`, which reports healthy for as
# long as the container can start node — including on a worker whose loop has
# been wedged for an hour. The poller now touches HALYARD_LIVENESS_FILE on the
# same beat as the database row, and only after that row is written, so a
# worker that has lost the database goes unhealthy too.
#
# Three missed beats before failing, matching --retries=3 above. A missing file
# throws, which is the correct answer during a start that never got going.
HEALTHCHECK --interval=60s --timeout=10s --start-period=90s --retries=3 \
  CMD node -e "const{statSync}=require('fs');process.exit(Date.now()-statSync(process.env.HALYARD_LIVENESS_FILE).mtimeMs<180000?0:1)"

CMD ["pnpm", "--filter", "@halyard/worker", "start"]
