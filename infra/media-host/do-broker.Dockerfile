# Only the locally imported and verified retained AMD64 broker is accepted by the
# release script. No package downloads or mutable registry fetch occurs here.
ARG VERIFIED_BROKER_BASE
FROM ${VERIFIED_BROKER_BASE}
ARG SOURCE_REVISION
ARG SOURCE_CONTEXT_HASH
LABEL org.opencontainers.image.revision=$SOURCE_REVISION io.thesyncexchange.context-sha256=$SOURCE_CONTEXT_HASH
USER 0:0
COPY services/media-broker/do-*.mjs services/media-broker/linux-host-binding.mjs services/media-broker/dispatch-loop.mjs services/media-broker/operational-health.mjs /app/services/media-broker/
USER 20000:20000
ENTRYPOINT ["/usr/local/bin/node","/app/services/media-broker/do-entrypoint.mjs"]
