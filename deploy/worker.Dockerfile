FROM node:22-bookworm AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages ./packages
COPY apps/worker ./apps/worker
RUN pnpm install --frozen-lockfile && pnpm -r --filter @wallpaper-manager/worker... build

FROM node:22-bookworm-slim
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl xz-utils gnupg && rm -rf /var/lib/apt/lists/* \
 && if [ "$(dpkg --print-architecture)" = "arm64" ]; then dpkg --add-architecture i386 && curl -fsSL https://ryanfortner.github.io/box64-debs/box64.list -o /etc/apt/sources.list.d/box64.list && curl -fsSL https://ryanfortner.github.io/box64-debs/KEY.gpg | gpg --dearmor -o /etc/apt/trusted.gpg.d/box64-debs-archive-keyring.gpg && apt-get update && apt-get install -y --no-install-recommends box64 libc6:i386 libstdc++6:i386 libgcc-s1:i386 && rm -rf /var/lib/apt/lists/*; else apt-get update && apt-get install -y --no-install-recommends lib32gcc-s1 lib32stdc++6 && rm -rf /var/lib/apt/lists/*; fi
WORKDIR /app
RUN corepack enable && mkdir -p /opt/steamcmd && curl -fsSL https://steamcdn-a.akamaihd.net/client/installer/steamcmd_linux.tar.gz | tar -xz -C /opt/steamcmd \
 && printf '#!/bin/sh\nif [ "$(uname -m)" = "aarch64" ]; then export BOX64_LD_LIBRARY_PATH=/usr/lib/i386-linux-gnu:/lib/i386-linux-gnu; exec box64 /opt/steamcmd/linux32/steamcmd "$@"; else exec /opt/steamcmd/linux32/steamcmd "$@"; fi\n' > /opt/steamcmd/steamcmd.sh && chmod +x /opt/steamcmd/steamcmd.sh \
 && mkdir -p /app-data /wallpaper-manager /steam-config && chown -R node:node /app-data /wallpaper-manager /steam-config
COPY --from=build /app /app
USER node
EXPOSE 9780
CMD ["node", "apps/worker/dist/main.js"]
