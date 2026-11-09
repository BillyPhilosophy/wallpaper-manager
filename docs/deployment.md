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
# STEAM_DATA_ROOT=/mnt/data/data/steam-data
STEAM_WEB_API_KEY=
# STEAMGUARD_CLI_PASSKEY_FILE=/steam-config/steamguard/passkey
MAX_QUEUE_LENGTH=20
# STEAM_NETWORK_MODE=auto
# STEAM_PROXY_URL=http://host.docker.internal:7890
# HTTP_PROXY=http://host.docker.internal:7890
# HTTPS_PROXY=http://host.docker.internal:7890
NO_PROXY=localhost,127.0.0.1,web,api,worker,redis
```

`WALLPAPER_DATA_ROOT` 是应用数据的宿主机根目录，存放 `app-data`（SQLite 数据库）、`staging`、`steam-config`、`trash` 等小文件高频读写数据。未设置时使用 `/srv/wallpaper-manager`。容器内部路径保持固定，不需要修改。

`STEAM_DATA_ROOT` 单独控制壁纸文件目录（大文件、读多写少），默认指向 `${WALLPAPER_DATA_ROOT}/steam-data`，与旧部署兼容。可将其指向独立的外接硬盘路径（如 `/mnt/data/data/steam-data`），把大容量壁纸放外接盘，而让数据库和 staging 的高频写入留在本地盘上。拆盘用于隔离移动盘故障的影响，不能修复 USB 线、供电、转接桥或盘体造成的硬件 EIO。

> 注意：不建议把 `WALLPAPER_DATA_ROOT`（含 SQLite 数据库）直接放不稳定的移动硬盘。将数据库留在本地盘、仅 `steam-data` 放移动盘是推荐做法；移动盘出现持续 I/O 错误时仍需检查硬件并备份，不能只靠跳过初始化错误继续运行。

Worker 和发布工作流只提供一套原生 ARM64 镜像，不再区分 Pi 5 Box64 变体。自动手机令牌及可选的 maFiles passkey 配置见 `docs/steam-login.md`。

Compose 的一次性 `init` 服务会自动创建 `app-data`、`staging`、`steam-config`、`trash`（本地盘）和 `steam-data`（可外接盘），将应用目录所有权设为 UID/GID `1000:1000`，并将 `steam-config` 权限设为 `0700`。对 `steam-data` 的 `chown`/`chmod` 采用「尽力而为」策略：若该盘文件系统不支持属主变更或报 EIO，会跳过而非让初始化失败。初始化成功后退出，API 和 Worker 仅在初始化成功后启动，重复启动不会清除已有数据。

`staging`、`trash` 必须与 `app-data` 保持在同一文件系统（即 `WALLPAPER_DATA_ROOT` 内）。`steam-data` 可以在不同文件系统：发布与删除时若 `rename` 报 `EXDEV`（跨设备），会自动退化为「复制 + 删除源」完成移动；跨盘复制不是原子操作，中断后需要检查部分目标目录。若 DSH 使用其他用户，应通过共享组或严格的最小 ACL 授予 `steam-data` 读权限，不要开放 `0777`。

如果 `STEAM_DATA_ROOT` 位于外接硬盘，启动前必须用 `findmnt` 确认预期分区已挂载，并检查目标目录存在。仅对空挂载点执行 `ls` 不足以证明硬盘已挂载；否则 Docker 可能在系统盘创建同名目录并继续写入。

如需通过宿主机代理访问 Steam，设置 `STEAM_PROXY_URL`（也可使用 `HTTP_PROXY`/`HTTPS_PROXY`），例如 `http://host.docker.internal:7890`。Compose 会把该主机名映射到 Docker 宿主机网关，代理服务应监听 `0.0.0.0` 并允许容器网段访问。`STEAM_NETWORK_MODE` 支持 `direct`、`proxy`、`auto`：配置代理时默认 `proxy`，未配置时默认 `direct`。`auto` 先进行 5 秒直连探测，成功保持 15 分钟，只在网络错误时切代理，HTTP 状态和认证错误不会触发切换。保留 `NO_PROXY` 中的内部服务名，避免内部请求进入代理。修改后重建 API 和 Worker 容器。

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

API Key 也可通过 Compose 支持的安全密钥注入机制提供；不要提交 `deploy/.env`。它与 DepotDownloader 登录无关。API 只读挂载 `steam-data`，Worker 可写共享目录，任何业务服务均不挂载 Docker Socket。只有一次性初始化服务以 root 运行，业务容器继续使用非 root 用户。

迁移仅由 API 容器启动命令执行，Worker 等待 API 健康后启动。Redis 已开启 AOF，Worker 并发固定为 1。Worker 使用固定版本的原生 ARM64 DepotDownloader 和 steamguard-cli，不再需要 Box64 或 32 位运行库；真实登录、自动 Guard 和下载仍需在目标 ARM64 Linux 设备上实测。

修改 `WALLPAPER_DATA_ROOT` 或 `STEAM_DATA_ROOT` 不会自动迁移已有数据。切换路径前应停止服务，将原数据完整迁移并校验后再修改配置；保留旧副本直到服务验证通过，同时更新 DSH 的实际 `STEAM_DATA_ROOT` 共享目录配置。

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
