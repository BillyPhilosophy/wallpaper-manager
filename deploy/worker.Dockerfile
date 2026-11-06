FROM node:22-trixie AS build
WORKDIR /app
RUN npm install -g pnpm@10.32.1
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages ./packages
COPY apps/worker ./apps/worker
RUN --mount=type=cache,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile && pnpm -r --filter @wallpaper-manager/worker... build

FROM node:22-trixie-slim
ARG TARGETARCH
ARG DEPOTDOWNLOADER_VERSION=3.4.0
ARG STEAMGUARD_VERSION=0.18.4
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl unzip && rm -rf /var/lib/apt/lists/*
RUN set -eux; \
    case "$TARGETARCH" in \
      amd64) depot_arch=linux-x64; depot_sha256=a999dec66b4850fc961bd50366696d23c2d0fad7b18790e6a5647b2f19097a53; guard_arch=linux-x86_64; guard_sha256=323d81bbe5809b56dd7023223b9d553d1fda58dc1ec2173c1e07cdfe1af89687 ;; \
      arm64) depot_arch=linux-arm64; depot_sha256=d9fb612ccebc1db8eeea3b4045d2221ec70431381393ce908fb72f01d4f9c812; guard_arch=linux-aarch64; guard_sha256=693e03e971b4edae562c37273a55f0d0a1d6c848845c801edfa91bf4cc849049 ;; \
      *) echo "Unsupported architecture: $TARGETARCH"; exit 1 ;; \
    esac; \
    curl -fsSL "https://github.com/SteamRE/DepotDownloader/releases/download/DepotDownloader_${DEPOTDOWNLOADER_VERSION}/DepotDownloader-${depot_arch}.zip" -o /tmp/depotdownloader.zip; \
    echo "$depot_sha256  /tmp/depotdownloader.zip" | sha256sum -c -; \
    mkdir -p /opt/depotdownloader; \
    unzip -q /tmp/depotdownloader.zip -d /opt/depotdownloader; \
    chmod 0755 /opt/depotdownloader/DepotDownloader; \
    curl -fsSL "https://github.com/dyc3/steamguard-cli/releases/download/v${STEAMGUARD_VERSION}/steamguard-${guard_arch}" -o /tmp/steamguard; \
    echo "$guard_sha256  /tmp/steamguard" | sha256sum -c -; \
    install -m 0755 /tmp/steamguard /usr/local/bin/steamguard; \
    rm -f /tmp/depotdownloader.zip /tmp/steamguard
WORKDIR /app
RUN mkdir -p /app-data /wallpaper-manager /steam-config && chown -R node:node /app-data /wallpaper-manager /steam-config
COPY --from=build /app /app
USER node
EXPOSE 9780
CMD ["node", "apps/worker/dist/main.js"]
