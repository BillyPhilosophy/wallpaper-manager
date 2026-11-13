FROM --platform=$BUILDPLATFORM mcr.microsoft.com/dotnet/sdk:9.0-bookworm-slim AS depot-build
ARG TARGETARCH
ARG DEPOTDOWNLOADER_VERSION=3.4.0
ARG DEPOTDOWNLOADER_SHA256=3bd1259ce6a26bcf0e61450e48ffd8bd5e455eae904cc4e2340a6d7773e7a5d0
WORKDIR /src
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl unzip patch && rm -rf /var/lib/apt/lists/*
RUN curl -fsSL "https://github.com/SteamRE/DepotDownloader/archive/refs/tags/DepotDownloader_${DEPOTDOWNLOADER_VERSION}.zip" -o /tmp/depotdownloader.zip \
 && echo "$DEPOTDOWNLOADER_SHA256  /tmp/depotdownloader.zip" | sha256sum -c - \
 && unzip -q /tmp/depotdownloader.zip -d /tmp \
 && cp -a /tmp/DepotDownloader-DepotDownloader_${DEPOTDOWNLOADER_VERSION}/. /src/ \
 && rm -f /tmp/depotdownloader.zip
COPY deploy/depotdownloader-progress.patch /tmp/depotdownloader-progress.patch
RUN patch -p1 < /tmp/depotdownloader-progress.patch \
 && case "$TARGETARCH" in amd64) runtime=linux-x64 ;; arm64) runtime=linux-arm64 ;; *) echo "Unsupported architecture: $TARGETARCH"; exit 1 ;; esac \
 && dotnet publish DepotDownloader/DepotDownloader.csproj --configuration Release --runtime "$runtime" --self-contained true -p:PublishSingleFile=true --output /opt/depotdownloader

FROM node:22-trixie AS build
WORKDIR /app
RUN npm install -g pnpm@10.32.1
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY patches ./patches
COPY packages ./packages
COPY apps/worker ./apps/worker
RUN --mount=type=cache,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile && pnpm -r --filter @wallpaper-manager/worker... build

FROM node:22-trixie-slim
ARG TARGETARCH
ARG STEAMGUARD_VERSION=0.18.4
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl && rm -rf /var/lib/apt/lists/* \
 && case "$TARGETARCH" in \
      amd64) guard_arch=linux-x86_64; guard_sha256=323d81bbe5809b56dd7023223b9d553d1fda58dc1ec2173c1e07cdfe1af89687 ;; \
      arm64) guard_arch=linux-aarch64; guard_sha256=693e03e971b4edae562c37273a55f0d0a1d6c848845c801edfa91bf4cc849049 ;; \
      *) echo "Unsupported architecture: $TARGETARCH"; exit 1 ;; \
    esac \
 && curl -fsSL "https://github.com/dyc3/steamguard-cli/releases/download/v${STEAMGUARD_VERSION}/steamguard-${guard_arch}" -o /tmp/steamguard \
 && echo "$guard_sha256  /tmp/steamguard" | sha256sum -c - \
 && install -m 0755 /tmp/steamguard /usr/local/bin/steamguard \
 && rm -f /tmp/steamguard
COPY --from=depot-build /opt/depotdownloader /opt/depotdownloader
WORKDIR /app
RUN mkdir -p /app-data /wallpaper-manager /steam-config && chown -R node:node /app-data /wallpaper-manager /steam-config
COPY --from=build /app /app
USER node
EXPOSE 9780
CMD ["node", "apps/worker/dist/main.js"]
