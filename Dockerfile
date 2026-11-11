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

FROM manifests AS scheduler-dependencies
RUN bun install --production --frozen-lockfile --filter @sora/scheduler

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

FROM runtime AS scheduler
# Listens to each dub once and times the sub's subtitles to when its characters
# speak: ffmpeg reads the audio and faster-whisper finds the words. The model
# is fetched at build time so the first dub does not wait for it.
USER root
RUN apt-get update \
	&& apt-get install -y --no-install-recommends ffmpeg python3 python3-venv \
	&& rm -rf /var/lib/apt/lists/* \
	&& python3 -m venv /opt/whisper \
	&& /opt/whisper/bin/pip install --no-cache-dir faster-whisper \
	&& HF_HOME=/opt/whisper/models /opt/whisper/bin/python -c "from faster_whisper import WhisperModel; WhisperModel('small.en', device='cpu', compute_type='int8')" \
	&& chown -R bun /opt/whisper/models
ENV SUBTITLE_ALIGNMENT_PYTHON=/opt/whisper/bin/python HF_HOME=/opt/whisper/models
# Upscales backdrops on request. Without a graphics card, Mesa's software
# Vulkan driver runs it on the processor, which takes minutes per backdrop.
RUN apt-get update \
	&& apt-get install -y --no-install-recommends ca-certificates curl unzip libvulkan1 mesa-vulkan-drivers libgomp1 \
	&& rm -rf /var/lib/apt/lists/* \
	&& curl -fsSL -o /tmp/realesrgan.zip https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesrgan-ncnn-vulkan-20220424-ubuntu.zip \
	&& unzip -q /tmp/realesrgan.zip -d /opt/realesrgan \
	&& rm /tmp/realesrgan.zip \
	&& chmod +x /opt/realesrgan/realesrgan-ncnn-vulkan
ENV REALESRGAN_BINARY=/opt/realesrgan/realesrgan-ncnn-vulkan
COPY --from=scheduler-dependencies /app /app
# Reads episode stills for title cards and text, so none is shown with them; fetched at build time too.
RUN cd packages/core \
	&& bun -e "import { env, pipeline } from '@huggingface/transformers'; env.cacheDir = '/opt/clip'; await pipeline('zero-shot-image-classification', 'Xenova/clip-vit-base-patch32')" \
	&& chown -R bun /opt/clip
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
CMD ["bun", "build/index.js"]
