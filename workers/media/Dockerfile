# Local build only. No registry push, Cloud Run provisioning or hosted processing.
FROM node:24.14.1-bookworm-slim@sha256:b506e7321f176aae77317f99d67a24b272c1f09f1d10f1761f2773447d8da26c AS build
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl xz-utils gcc make libc6-dev zlib1g-dev && rm -rf /var/lib/apt/lists/*
WORKDIR /build
RUN curl -fL https://ffmpeg.org/releases/ffmpeg-9.0.2.tar.xz -o ffmpeg.tar.xz && echo '8c3850283eb25fa026482078a04051e0be17347b09ef81a0849bec15a96e002e  ffmpeg.tar.xz' | sha256sum -c - && tar -xJf ffmpeg.tar.xz
COPY workers/media/build-ffmpeg.sh /build/build-ffmpeg.sh
WORKDIR /build/ffmpeg-9.0.2
RUN sh /build/build-ffmpeg.sh /opt/media
COPY tests/media-worker/descendant.c /build/descendant.c
RUN mkdir -p /opt/media-test/bin && gcc -O2 -o /opt/media-test/bin/ffmpeg /build/descendant.c

FROM node:24.14.1-bookworm-slim@sha256:b506e7321f176aae77317f99d67a24b272c1f09f1d10f1761f2773447d8da26c
RUN apt-get update && apt-get install -y --no-install-recommends python3 zlib1g && rm -rf /var/lib/apt/lists/* && mkdir /work && chown 1000:1000 /work && dpkg-query -W > /opt/runtime-packages.txt
COPY --from=build /opt/media/bin/ffmpeg /opt/media/bin/ffprobe /opt/media/bin/
COPY --from=build /opt/media-test/bin/ffmpeg /opt/media-test/bin/ffmpeg
WORKDIR /app
COPY workers/media/ workers/media/
COPY contracts/submission-media/ contracts/submission-media/
COPY tests/media-worker-media.test.mjs tests/media-worker-remediation.test.mjs tests/
COPY tests/media-worker/fixtures.mjs tests/media-worker/fixtures.mjs
COPY tests/media-worker/webp-fixtures.json tests/media-worker/webp-fixtures.json
COPY tests/media-worker/mp3-fixture.json tests/media-worker/mp3-fixture.json
ENV TMPDIR=/work MEDIA_TOOL_DIR=/opt/media/bin
USER 1000:1000
ENTRYPOINT ["node","workers/media/entrypoint.mjs"]
