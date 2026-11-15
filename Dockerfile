# syntax=docker/dockerfile:1
# Dokploy builds every service from this file, one target each: api, scheduler, web.

# Set by BuildKit to the platform being built; picks the upscale-tools stage.
ARG TARGETARCH

FROM oven/bun:1.4.0 AS base
WORKDIR /app

# bun install reads bun.lock against every workspace, so each stage that
# installs gets all manifests; --filter decides which ones get dependencies.
FROM base AS manifests
COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/package.json
COPY apps/scheduler/package.json apps/scheduler/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/sdk/package.json packages/sdk/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY patches patches

# Only the scheduler runs CLIP on episode stills (packages/core/src/tmdb/stills.ts
# imports it lazily), so the API drops transformers and its ~430 MB onnxruntime.
FROM manifests AS api-dependencies
RUN bun install --production --frozen-lockfile --filter @sora/api \
	&& rm -rf node_modules/.bun/@huggingface+transformers@* node_modules/.bun/onnxruntime-*

# Transformers.js carries the onnxruntime-web code it runs in Node inside its
# own bundle, and onnxruntime-node ships binaries for every platform, so only
# this platform's binaries stay (~380 MB less to copy and export).
FROM manifests AS scheduler-dependencies
RUN bun install --production --frozen-lockfile --filter @sora/scheduler \
	&& rm -rf node_modules/.bun/onnxruntime-web@* \
	&& find node_modules/.bun/onnxruntime-node@*/node_modules/onnxruntime-node/bin -mindepth 3 -maxdepth 3 -type d \
		! -path "*/linux/$(bun -p process.arch)" -exec rm -rf {} +

# The web build inlines the workspace packages, so at runtime it only needs
# the npm packages in apps/web's dependencies.
FROM manifests AS web-dependencies
RUN bun install --production --frozen-lockfile --filter @sora/web

FROM manifests AS web-build
RUN bun install --frozen-lockfile
COPY . .
ENV NODE_ENV=production
WORKDIR /app/apps/web
RUN SORA_API_URL=http://127.0.0.1:3000 bun run --bun build

FROM base AS runtime
ENV NODE_ENV=production
COPY tsconfig.json ./

FROM runtime AS api
COPY --from=api-dependencies /app /app
COPY packages/shared packages/shared
COPY packages/core packages/core
COPY apps/api apps/api
ENV HOST=0.0.0.0 PORT=3000
USER bun
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD bun -e "const r = await fetch('http://127.0.0.1:3000/health'); process.exit(r.ok ? 0 : 1)"
CMD ["sh", "-c", "bun packages/core/src/database/migrate.ts && exec bun apps/api/src/main.ts"]

# Reads episode stills for title cards and text, so none is shown with them.
# The model is fetched at build time so a new container does not fetch it again.
FROM scheduler-dependencies AS still-model
COPY packages/core/src/tmdb/still-model.ts packages/core/src/tmdb/still-labels.generated.json packages/core/src/tmdb/
RUN cd packages/core \
	&& bun -e "import { loadStillModel } from './src/tmdb/still-model.ts'; await loadStillModel('/opt/clip')"

# Listens to each dub once and times the sub's subtitles to when its characters
# speak: ffmpeg reads the audio and faster-whisper finds the words. The model
# is fetched at build time so the first dub does not wait for it. These tools
# sit below the app in the scheduler and build from the bare base, so neither
# an app change nor a tsconfig change rebuilds them.
FROM base AS dub-tools
ARG DEBIAN_FRONTEND=noninteractive
USER root
RUN apt-get update \
	&& apt-get install -y --no-install-recommends ca-certificates python3 python3-venv \
	&& rm -rf /var/lib/apt/lists/* \
	&& python3 -m venv /opt/whisper \
	&& /opt/whisper/bin/pip install --no-cache-dir faster-whisper \
	&& HF_HOME=/opt/whisper/models /opt/whisper/bin/python -c "from faster_whisper import WhisperModel; WhisperModel('small.en', device='cpu', compute_type='int8')" \
	&& chown -R bun /opt/whisper/models
ENV SUBTITLE_ALIGNMENT_PYTHON=/opt/whisper/bin/python HF_HOME=/opt/whisper/models
# A static build: Debian's ffmpeg package pulls in ~200 libraries for what is
# only ever audio decoding from a pipe here.
COPY --from=mwader/static-ffmpeg:9.0.2-1 /ffmpeg /usr/local/bin/ffmpeg

# Upscales backdrops on request. Without a graphics card, Mesa's software
# Vulkan driver runs it on the processor, which takes minutes per backdrop.
# Real-ESRGAN only publishes an x86-64 Linux build. The download is checked
# against its hash and unpacked with Python's zipfile, so no curl or unzip.
FROM scratch AS realesrgan-download
ADD --checksum=sha256:e5aa6eb131234b87c0c51f82b89390f5e3e642b7b70f2b9bbe95b6a285a40c96 \
	https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesrgan-ncnn-vulkan-20220424-ubuntu.zip /realesrgan.zip

FROM dub-tools AS upscale-tools-amd64
ARG DEBIAN_FRONTEND=noninteractive
RUN --mount=type=bind,from=realesrgan-download,target=/tmp/realesrgan \
	apt-get update \
	&& apt-get install -y --no-install-recommends libvulkan1 mesa-vulkan-drivers libgomp1 \
	&& rm -rf /var/lib/apt/lists/* \
	&& python3 -m zipfile -e /tmp/realesrgan/realesrgan.zip /opt/realesrgan \
	&& chmod +x /opt/realesrgan/realesrgan-ncnn-vulkan
ENV REALESRGAN_BINARY=/opt/realesrgan/realesrgan-ncnn-vulkan

# On arm64, REALESRGAN_BINARY stays unset, so upscaling a backdrop fails with
# its message instead of crashing on an x86-64 binary.
FROM dub-tools AS upscale-tools-arm64

# The scheduler, with dub timing and backdrop upscaling.
FROM upscale-tools-${TARGETARCH} AS scheduler
ENV NODE_ENV=production
COPY --from=scheduler-dependencies /app /app
COPY tsconfig.json ./
COPY --from=still-model --chown=bun /opt/clip /opt/clip
ENV STILL_MODEL_DIR=/opt/clip
COPY packages/shared packages/shared
COPY packages/core packages/core
COPY apps/scheduler apps/scheduler
USER bun
CMD ["bun", "apps/scheduler/src/main.ts"]

FROM runtime AS web
COPY --from=web-dependencies /app /app
WORKDIR /app/apps/web
COPY --from=web-build /app/apps/web/build build
USER bun
# Room for a library import: a long history is a few megabytes of JSON.
ENV HOST=0.0.0.0 PORT=3000 BODY_SIZE_LIMIT=25M
EXPOSE 3000
# A static file, so the check passes whether or not the API is up.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD bun -e "const r = await fetch('http://127.0.0.1:3000/robots.txt'); process.exit(r.ok ? 0 : 1)"
CMD ["bun", "build/index.js"]
