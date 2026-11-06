FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN corepack enable && apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages ./packages
COPY apps/api ./apps/api
RUN pnpm install --frozen-lockfile && pnpm -r --filter @wallpaper-manager/api... build

FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
RUN corepack enable && apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY --from=build /app /app
RUN mkdir -p /app-data /wallpaper-manager/steam-data && chown -R node:node /app-data /wallpaper-manager
USER node
EXPOSE 3000
CMD ["sh", "-c", "pnpm --filter @wallpaper-manager/database exec prisma migrate deploy && node apps/api/dist/main.js"]
