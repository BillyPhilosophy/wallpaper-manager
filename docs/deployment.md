# 部署指南

## 前置条件

目标为 ARM64 树莓派、Docker Engine 与 Compose v2。Node.js 仅开发时需要 `>=22.12.0`。不要把 `8083` 直接暴露到公网；MVP 仅用于可信局域网单用户环境。

```bash
sudo install -d -o 1000 -g 1000 -m 0755 /srv/wallpaper-manager/{app-data,staging,steam-data,steam-config,trash}
sudo chmod 0700 /srv/wallpaper-manager/steam-config
# staging、steam-data、trash 必须在同一文件系统
findmnt -T /srv/wallpaper-manager
```

容器使用 UID/GID `1000:1000`。若 DSH 使用其他用户，应通过共享组或严格的最小 ACL 授予 `steam-data` 读权限，不要使用 root-only 权限，也不要开放 `0777`。

## 配置与启动

### 从 Docker Hub 部署（推荐）

在 GitHub 仓库 Settings → Secrets and variables → Actions 配置 `DOCKERHUB_USERNAME` 和 `DOCKERHUB_TOKEN`，然后手动运行 **build-images** 工作流。工作流使用 QEMU 构建 `linux/arm64`，分别发布 `wallpaper-manager-web`、`wallpaper-manager-api`、`wallpaper-manager-worker` 的 `latest` 与 `sha-<完整提交哈希>` 标签。

树莓派只需取得 `deploy/docker-compose.yml`，在其所在目录执行：

```bash
export DOCKERHUB_USERNAME='你的Docker Hub用户名'
export STEAM_WEB_API_KEY='你的服务端Key'
docker compose pull
docker compose up -d
docker compose ps
```

`IMAGE_TAG` 默认为 `latest`。回滚时设置 `IMAGE_TAG=sha-<完整提交哈希>` 后重新执行 `pull` 和 `up -d`。Redis 使用官方 `redis:7-alpine`，由 Compose 自动拉取。

### 本地源码构建

```bash
cd deploy
STEAM_WEB_API_KEY='你的服务端Key' docker compose up -d --build
```

API Key 也可通过 Compose 支持的安全密钥注入机制提供；不要提交 `.env`。它与 SteamCMD 登录无关。API 只读挂载 `steam-data`，Worker 可写共享目录，任何服务均不挂载 Docker Socket。

迁移仅由 API 容器启动命令执行，Worker 等待 API 健康后启动。Redis 已开启 AOF，Worker 并发固定为 1。Worker 镜像在 ARM64 上使用 Box64 运行官方 32 位 SteamCMD，仍需在目标树莓派实测。

## 备份和恢复

1. 暂停 API 与 Worker：`docker compose stop api worker`。
2. 复制 `app-data/wallpaper-manager.db`、`steam-config` 和 `steam-data`。
3. 恢复后确认 UID/GID，再执行 `docker compose up -d`。
4. 检查 `api` 日志中的迁移结果、Worker 恢复任务和 Redis AOF。

SQLite 在线备份可使用 SQLite backup API；不要在一个进程写库时只复制 WAL 数据库的单主文件。

## 验证

```bash
curl http://树莓派IP:8083/api/health
curl http://树莓派IP:8083/api/system/capabilities
../scripts/check-webwallgl.sh
```

真实验收必须覆盖搜索、登录/Guard、Scene 下载和预览、取消、重试、删除、重启恢复，以及 DSH 清单和渲染。网页中的构建与 mock E2E 不能替代这些检查。
