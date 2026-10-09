FROM node:24.14.1-bookworm-slim@sha256:b506e7321f176aae77317f99d67a24b272c1f09f1d10f1761f2773447d8da26c
RUN node -e "require('fs').writeFileSync('/tmp/bootstrap-ca.pem',require('tls').rootCertificates.join('\\n'))" && printf '%s\n'  'deb [check-valid-until=no] https://snapshot.debian.org/archive/debian/20261007T000000Z/ bookworm main' 'deb [check-valid-until=no] https://snapshot.debian.org/archive/debian-security/20261007T000000Z/ bookworm-security main' > /etc/apt/sources.list && rm -f /etc/apt/sources.list.d/debian.sources && apt-get -o Acquire::Check-Valid-Until=false -o Acquire::https::CaInfo=/tmp/bootstrap-ca.pem update  && apt-get -o Acquire::https::CaInfo=/tmp/bootstrap-ca.pem dist-upgrade -y && rm -rf /var/lib/apt/lists/*
WORKDIR /app/services/media-broker
COPY services/media-broker/package.json services/media-broker/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund && mkdir /work && chown 1000:1000 /work && dpkg-query -W > /opt/runtime-packages.txt && rm -rf /usr/local/lib/node_modules /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack
WORKDIR /app
COPY services/media-broker/ services/media-broker/
COPY workers/media/ workers/media/
COPY contracts/submission-media/ contracts/submission-media/
COPY tests/media-broker-security.test.mjs tests/
ENV TMPDIR=/work
USER 1000:1000
ENTRYPOINT ["node","services/media-broker/entrypoint.mjs"]
