# Reuse verified native codecs and sandbox; only source-input bounds change.
ARG VERIFIED_WORKER_BASE
FROM ${VERIFIED_WORKER_BASE}
ARG SOURCE_REVISION
ARG SOURCE_CONTEXT_HASH
LABEL org.opencontainers.image.revision=$SOURCE_REVISION io.thesyncexchange.context-sha256=$SOURCE_CONTEXT_HASH
COPY workers/media/parser-boundary.mjs workers/media/direct-input.mjs /app/workers/media/
