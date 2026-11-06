# 部署指南

## 前置条件

面向 ARM64 Linux 设备，树莓派是主要参考部署环境。需要 Docker Engine 与 Compose v2。Node.js 仅开发时需要 `>=22.12.0`。不要把 `8083` 直接暴露到公网；MVP 仅用于可信局域网单用户环境。

从项目根目录复制并编辑环境配置：

```bash
cp deploy/.env.example deploy/.env
```

`deploy/.env` 可用配置如下：

```env
DOCKERHUB_USERNAME=local
IMAGE_TAG=latest
WALLPAPER_DATA_ROOT=/srv/wallpaper-manager
STEAM_WEB_API_KEY=
MAX_QUEUE_LENGTH=20
```

`WALLPAPER_DATA_ROOT` 是所有应用数据的宿主机根目录，可改为 `/mnt/wallpaper-disk/wallpaper-manager` 等外接硬盘路径。未设置时使用 `/srv/wallpaper-manager`。容器内部路径保持固定，不需要修改。

Compose 的一次性 `init` 服务会自动创建 `app-data`、`staging`、`steam-data`、`steam-config` 和 `trash`，将应用目录所有权设为 UID/GID `1000:1000`，并将 `steam-config` 权限设为 `0700`。初始化成功后退出，API 和 Worker 仅在初始化成功后启动，重复启动不会清除已有数据。

`staging`、`steam-data`、`trash` 必须保持在同一文件系统。若 DSH 使用其他用户，应通过共享组或严格的最小 ACL 授予 `steam-data` 读权限，不要开放 `0777`。

如果数据根目录位于外接硬盘，启动前必须确认硬盘已挂载。容器中的初始化服务无法可靠检测宿主机是否漏挂硬盘；否则 Docker 可能在系统盘创建同名目录并继续写入。

## 配置与启动

Compose 默认读取 Compose 文件所在目录的 `deploy/.env`，无需 `--env-file` 或重复执行 `export`。以下命令均在项目根目录执行；在 1Panel 中也可直接打开 `deploy/docker-compose.yml` 创建编排。

### 从 Docker Hub 部署（推荐）

在 GitHub 仓库 Settings → Secrets and variables → Actions 配置 `DOCKERHUB_USERNAME` 和 `DOCKERHUB_TOKEN`，然后手动运行 **build-images** 工作流。工作流使用 QEMU 构建 `linux/arm64`，分别发布 `wallpaper-manager-web`、`wallpaper-manager-api`、`wallpaper-manager-worker` 的 `latest` 与 `sha-<完整提交哈希>` 标签。

树莓派取得 `deploy/docker-compose.yml` 和 `deploy/.env.example`，完成 `deploy/.env` 配置后执行：

```bash
docker compose -f deploy/docker-compose.yml pull
docker compose -f deploy/docker-compose.yml up -d
docker compose -f deploy/docker-compose.yml ps
```

`IMAGE_TAG` 默认为 `latest`。回滚时在 `deploy/.env` 中设置 `IMAGE_TAG=sha-<完整提交哈希>`，再重新执行 `pull` 和 `up -d`。Redis 使用官方 `redis:7-alpine`，初始化服务使用 `alpine:3.21`，均由 Compose 自动拉取。

### 本地源码构建

```bash
docker compose -f deploy/docker-compose.yml up -d --build
```

API Key 也可通过 Compose 支持的安全密钥注入机制提供；不要提交 `deploy/.env`。它与 SteamCMD 登录无关。API 只读挂载 `steam-data`，Worker 可写共享目录，任何业务服务均不挂载 Docker Socket。只有一次性初始化服务以 root 运行，业务容器继续使用非 root 用户。

迁移仅由 API 容器启动命令执行，Worker 等待 API 健康后启动。Redis 已开启 AOF，Worker 并发固定为 1。Worker 镜像在 ARM64 上使用 Box64 运行官方 32 位 SteamCMD，仍需在目标 ARM64 Linux 设备上实测。

修改 `WALLPAPER_DATA_ROOT` 不会自动迁移已有数据。切换路径前应停止服务，将原数据完整迁移到新根目录并检查权限，同时更新 DSH 的共享目录配置。

## 备份和恢复

1. 暂停 API 与 Worker：`docker compose -f deploy/docker-compose.yml stop api worker`。
2. 复制 `WALLPAPER_DATA_ROOT` 下的 `app-data/wallpaper-manager.db`、`steam-config` 和 `steam-data`。
3. 恢复后确认 UID/GID，再执行 `up -d`。
4. 检查 `api` 日志中的迁移结果、Worker 恢复任务和 Redis AOF。

SQLite 在线备份可使用 SQLite backup API；不要在一个进程写库时只复制 WAL 数据库的单主文件。

## 验证

```bash
curl http://树莓派IP:8083/api/health
curl http://树莓派IP:8083/api/system/capabilities
./scripts/check-webwallgl.sh
```

真实验收必须覆盖搜索、登录/Guard、Scene 下载和预览、取消、重试、删除、重启恢复，以及 DSH 清单和渲染。网页中的构建与 mock E2E 不能替代这些检查。
