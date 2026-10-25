FROM oven/bun:1.4.0 AS dependencies
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/package.json
COPY apps/scheduler/package.json apps/scheduler/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/sdk/package.json packages/sdk/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY patches patches
RUN bun install --frozen-lockfile
COPY . .
ENV NODE_ENV=production

FROM dependencies AS api
ENV HOST=0.0.0.0 PORT=3000
USER bun
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD bun -e "const r = await fetch('http://127.0.0.1:3000/health'); process.exit(r.ok ? 0 : 1)"
CMD ["sh", "-c", "bun packages/core/src/database/migrate.ts && exec bun apps/api/src/main.ts"]

FROM dependencies AS scheduler
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
USER bun
CMD ["bun", "apps/scheduler/src/main.ts"]

FROM dependencies AS web
WORKDIR /app/apps/web
RUN SORA_API_URL=http://127.0.0.1:3000 bun run --bun build
USER bun
ENV HOST=0.0.0.0 PORT=3000
EXPOSE 3000
CMD ["bun", "build/index.js"]
