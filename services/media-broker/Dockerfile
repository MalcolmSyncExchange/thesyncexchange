# Maintained Debian/Node inputs; final runtime is only the explicit ELF closure.
FROM node:26.11.1-trixie-slim@sha256:193fe51b64e77981119c98c2002c9e32a70e2f006fb4d25068ce0558998917f0 AS build
RUN node -e "require('fs').writeFileSync('/tmp/bootstrap-ca.pem',require('tls').rootCertificates.join('\\n'))" && printf '%s\n' 'deb [check-valid-until=no] https://snapshot.debian.org/archive/debian/20261007T000000Z/ trixie main' 'deb [check-valid-until=no] https://snapshot.debian.org/archive/debian-security/20261007T000000Z/ trixie-security main' > /etc/apt/sources.list && rm -f /etc/apt/sources.list.d/debian.sources && apt-get -o Acquire::Check-Valid-Until=false -o Acquire::https::CaInfo=/tmp/bootstrap-ca.pem update && apt-get -o Acquire::https::CaInfo=/tmp/bootstrap-ca.pem install -y --no-install-recommends python3
WORKDIR /app/services/media-broker
COPY services/media-broker/package.json services/media-broker/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund
COPY services/media-broker/runtime-rootfs.py /build/runtime-rootfs.py
RUN python3 /build/runtime-rootfs.py /usr/local/bin/node
FROM scratch
ARG SOURCE_REVISION=unrecorded
ARG SOURCE_TREE=unrecorded
ARG SOURCE_CONTEXT_HASH=unrecorded
LABEL org.opencontainers.image.revision=$SOURCE_REVISION io.thesyncexchange.source-tree=$SOURCE_TREE io.thesyncexchange.context-sha256=$SOURCE_CONTEXT_HASH
COPY --from=build /runtime-rootfs/ /
COPY --from=build /app/services/media-broker/node_modules/ /app/services/media-broker/node_modules/
WORKDIR /app
COPY services/media-broker/*.mjs services/media-broker/package.json services/media-broker/package-lock.json services/media-broker/
COPY workers/media/broker.mjs workers/media/files.mjs workers/media/errors.mjs workers/media/media.mjs workers/media/runtime-preflight.mjs workers/media/
COPY contracts/submission-media/ contracts/submission-media/
COPY tests/media-broker-security.test.mjs tests/
ENV TMPDIR=/work PATH=/usr/local/bin:/usr/bin
USER 1000:1000
ENTRYPOINT ["/usr/local/bin/node","services/media-broker/entrypoint.mjs"]
