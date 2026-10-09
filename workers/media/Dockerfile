# All build dependencies remain in pinned maintained build stages.
FROM node:24.21.0-trixie-slim@sha256:173f125896c3b47ddf056734c7ea789d04595a6a08769a8f78e0df642781fb66 AS node
FROM python:3.14.8-slim-trixie@sha256:f85c5697265c178cc6887276c55fe16cf3d14ca35c3df6a5eab3b360534a55d2 AS build
COPY --from=node /usr/local/bin/node /usr/local/bin/node
RUN node -e "require('fs').writeFileSync('/tmp/bootstrap-ca.pem',require('tls').rootCertificates.join('\\n'))" && printf '%s\n' 'deb [check-valid-until=no] https://snapshot.debian.org/archive/debian/20261007T000000Z/ trixie main' 'deb [check-valid-until=no] https://snapshot.debian.org/archive/debian-security/20261007T000000Z/ trixie-security main' > /etc/apt/sources.list && rm -f /etc/apt/sources.list.d/debian.sources && apt-get -o Acquire::Check-Valid-Until=false -o Acquire::https::CaInfo=/tmp/bootstrap-ca.pem update && apt-get -o Acquire::https::CaInfo=/tmp/bootstrap-ca.pem install -y --no-install-recommends ca-certificates curl xz-utils gcc make libc6-dev zlib1g-dev gnupg
WORKDIR /build
RUN curl -fL https://ffmpeg.org/releases/ffmpeg-9.0.2.tar.xz -o ffmpeg.tar.xz && echo '8c3850283eb25fa026482078a04051e0be17347b09ef81a0849bec15a96e002e  ffmpeg.tar.xz' | sha256sum -c - && curl -fL https://ffmpeg.org/releases/ffmpeg-9.0.2.tar.xz.asc -o ffmpeg.tar.xz.asc && curl -fL https://ffmpeg.org/ffmpeg-devel.asc -o ffmpeg-key.asc && gpg --batch --import ffmpeg-key.asc && gpg --batch --status-fd 1 --verify ffmpeg.tar.xz.asc ffmpeg.tar.xz > signature-status.txt && grep -q 'VALIDSIG FCF986EA15E6E293A5644F10B4322F04D67658D8 ' signature-status.txt && tar -xJf ffmpeg.tar.xz
COPY workers/media/build-ffmpeg.sh /build/build-ffmpeg.sh
WORKDIR /build/ffmpeg-9.0.2
RUN sh /build/build-ffmpeg.sh /opt/media && mkdir -p /opt/licenses && cp COPYING.LGPLv2.1 /opt/licenses/ffmpeg-LGPL.txt && cp /build/signature-status.txt /opt/licenses/ffmpeg-signature.txt
COPY tests/media-worker/descendant.c /build/descendant.c
RUN mkdir -p /opt/media-test/bin && gcc -O2 -o /opt/media-test/bin/ffmpeg /build/descendant.c
COPY --from=node /usr/local/LICENSE /usr/local/LICENSE
COPY services/media-broker/runtime-rootfs.py /build/runtime-rootfs.py
RUN WITH_PYTHON=1 python3 /build/runtime-rootfs.py /usr/local/bin/node /usr/local/bin/python3.14 /opt/media/bin/ffmpeg /opt/media/bin/ffprobe /opt/media-test/bin/ffmpeg
FROM scratch
COPY --from=build /runtime-rootfs/ /
COPY --from=build /opt/licenses/ /opt/licenses/
WORKDIR /app
COPY workers/media/*.mjs workers/media/sandbox.py workers/media/runtime-kernel-probe.py workers/media/
COPY services/media-broker/common.mjs services/media-broker/auth.mjs services/media-broker/
COPY contracts/submission-media/ contracts/submission-media/
COPY tests/media-worker-media.test.mjs tests/media-worker-remediation.test.mjs tests/
COPY tests/media-worker/fixtures.mjs tests/media-worker/webp-fixtures.json tests/media-worker/mp3-fixture.json tests/media-worker/resource.mjs tests/media-worker/
ENV TMPDIR=/work MEDIA_TOOL_DIR=/opt/media/bin PATH=/usr/local/bin:/usr/bin
USER 1000:1000
ENTRYPOINT ["/usr/local/bin/node","workers/media/entrypoint.mjs"]
