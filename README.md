# Wallpaper Manager

运行在 ARM64 Linux 设备上的 Wallpaper Engine 创意工坊管理网站。用户可以在浏览器中搜索、下载、预览和删除壁纸，并与同一台机器上的 DSH Wallpaper Engine 插件共享原始壁纸文件，无需重复下载或格式转换。

项目面向 **ARM64 Linux 设备、Docker Compose、无桌面环境和局域网单用户** 场景，树莓派是主要参考部署环境。设备只负责存储、下载和 HTTP 服务，Scene／Web 壁纸的 WebGL 渲染在用户浏览器中完成。

## 项目能做什么

- 使用 Steam 官方接口搜索和浏览创意工坊壁纸。
- 查看官方图片、动图、视频及完整元数据。
- 配置 SteamCMD 登录并处理 Steam Guard。
- 下载、取消、重试和删除壁纸，展示真实任务阶段，不伪造下载百分比。
- 使用固定版本的 `webwallgl@3.0.0` 在线预览已下载的 Scene／Web 壁纸。
- 与 DSH 共用同一份原始工坊文件，下载后即可在 DSH 壁纸库中使用。
- 通过暂存目录、资源校验和原子发布，避免网站或 DSH 读取半成品。
- 阻止 Application／EXE 壁纸，不执行壁纸目录中的第三方程序。

Steam Web API Key 和 SteamCMD 登录是两套独立配置。密码及 Guard 码不会写入数据库、BullMQ 任务或应用日志。

## 服务组成

| 服务 | 作用 | 是否对外暴露 |
|---|---|---|
| `web` | React 静态网站及 `/api` 反向代理 | 是，宿主机端口 `8083` |
| `api` | NestJS API、SQLite、资源读取、任务入队 | 否 |
| `worker` | SteamCMD 登录、下载、校验、发布和删除 | 否 |
| `redis` | BullMQ 队列存储，开启 AOF 持久化 | 否 |

部署时只需要反向代理 `web`，不要单独暴露 API、Worker 或 Redis。

## 使用 Docker Hub 部署（推荐）

### 1. 通过 GitHub Actions 发布 ARM64 镜像

项目提供 `.github/workflows/docker-image.yml`，用于手动构建并发布镜像。先准备 Docker Hub 账号，并在 Docker Hub 的 **Account settings → Security → Access tokens** 中创建具有仓库读写权限的 Access Token，不要使用账号密码。

然后在 GitHub 仓库的 **Settings → Secrets and variables → Actions → Secrets** 页面点击 **New repository secret**，分别添加：

| Secret 名称 | 填写内容 |
|---|---|
| `DOCKERHUB_USERNAME` | Docker Hub 用户名或组织名，决定镜像命名空间 |
| `DOCKERHUB_TOKEN` | 刚创建的 Docker Hub Access Token |

如果是 Fork 的仓库，可能还需要先在 **Actions** 页面启用工作流。随后进入 **Actions → build-images → Run workflow**，选择要构建的分支并运行。该工作流只在手动触发时发布镜像，不会随每次提交自动推送。

工作流通过 QEMU 和 Docker Buildx 并行构建 `web`、`api`、`worker` 三个 `linux/arm64` 镜像，并推送到 Docker Hub：

```text
<用户名>/wallpaper-manager-web:latest
<用户名>/wallpaper-manager-api:latest
<用户名>/wallpaper-manager-worker:latest
```

同时生成 `sha-<完整提交哈希>` 标签用于回滚。设备端 `deploy/.env` 中的 `DOCKERHUB_USERNAME` 必须与这里一致，否则 Compose 会拉取其他命名空间下的镜像。`STEAM_WEB_API_KEY` 只在设备端配置，不需要也不应添加到 GitHub Actions Secrets。

另一个 `.github/workflows/ci.yml` 会在 push 和 Pull Request 时自动执行类型检查、单元测试、构建和 E2E 测试，不需要 Docker Hub Secrets；它与镜像发布工作流相互独立。

### 2. 配置存储路径

在 ARM64 Linux 设备上安装 Docker Engine 和 Docker Compose v2。将 `deploy/docker-compose.yml` 与同目录的 `.env.example` 下载到设备并保持原有目录结构，然后创建配置：

```bash
cp deploy/.env.example deploy/.env
```

编辑 `deploy/.env`，至少设置 `DOCKERHUB_USERNAME` 和 `STEAM_WEB_API_KEY`。`WALLPAPER_DATA_ROOT` 默认为 `/srv/wallpaper-manager`，壁纸较多时建议改为外接硬盘路径，例如：

```env
WALLPAPER_DATA_ROOT=/mnt/wallpaper-disk/wallpaper-manager
```

启动时，Compose 的一次性 `init` 服务会自动创建所有数据目录并设置权限，无需手动执行建目录命令。`staging`、`steam-data` 和 `trash` 位于同一数据根目录，必须保持在同一文件系统。容器使用 UID/GID `1000:1000`，请确保 DSH 用户能够读取 `steam-data`，不要开放 `0777`。

如果数据目录位于外接硬盘，启动前必须确认硬盘已经挂载。容器无法可靠检测宿主机是否漏挂硬盘；否则 Docker 可能在系统盘创建同名目录。

### 3. 启动服务

在项目根目录执行：

```bash
docker compose -f deploy/docker-compose.yml pull
docker compose -f deploy/docker-compose.yml up -d
docker compose -f deploy/docker-compose.yml ps
```

看到全部服务健康后访问：

```text
http://树莓派IP:8083
```

健康检查：

```bash
curl http://树莓派IP:8083/api/health
curl http://树莓派IP:8083/api/system/capabilities
```

反向代理目标设置为 `http://127.0.0.1:8083` 即可。MVP 没有用户权限体系，建议只在可信局域网使用，不要直接暴露到公网。

### 4. 更新或回滚

更新到最新镜像：

```bash
docker compose -f deploy/docker-compose.yml pull
docker compose -f deploy/docker-compose.yml up -d
```

回滚时在 `deploy/.env` 中设置 `IMAGE_TAG=sha-<完整提交哈希>`，再重新执行上述 `pull` 和 `up -d` 命令。

修改 `WALLPAPER_DATA_ROOT` 不会自动迁移已有数据。切换路径前应停止服务，将原数据完整迁移到新根目录并检查权限。

## 从源码构建部署

在树莓派上取得完整源码，复制并编辑 `deploy/.env` 后执行：

```bash
cp deploy/.env.example deploy/.env
docker compose -f deploy/docker-compose.yml up -d --build
```

Worker 镜像在 ARM64 上通过 Box64 运行官方 SteamCMD。镜像构建成功不代表 SteamCMD 已完成实机验收，仍需测试真实登录、Guard 和下载。

## DSH 接入

如果 DSH 也使用 Docker Compose，为其增加只读挂载和环境变量，将示例中的数据根目录替换为实际 `WALLPAPER_DATA_ROOT`：

```yaml
services:
  dsh:
    # 既有镜像和其他配置保持不变
    volumes:
      - /srv/wallpaper-manager/steam-data:/wallpaper-manager/steam-data:ro
    environment:
      DSH_WE_STEAM_ROOT: /wallpaper-manager/steam-data
```

DSH 直接运行在宿主机时：

```bash
DSH_WE_STEAM_ROOT=/srv/wallpaper-manager/steam-data
```

该变量必须指向包含 `steamapps/` 的 Steam 根目录，不要指向 `431960` 或 Wallpaper Engine 安装目录。无需伪造 `libraryfolders.vdf`，也不要向 DSH 挂载 `staging`、`app-data` 或 `steam-config`。

下载完成后打开或刷新 DSH 壁纸库，由 `/wallpaper-engine/inventory` 请求触发清单重建。网站删除壁纸后，刷新 DSH 清单即可看到项目消失。

## 数据目录

以下目录均位于 `deploy/.env` 配置的 `WALLPAPER_DATA_ROOT` 下：

```text
/srv/wallpaper-manager/
├── app-data/       # SQLite 数据库
├── staging/        # 下载暂存，校验前不会进入正式壁纸库
├── steam-data/     # 网站 Worker 与 DSH 共享的原始壁纸文件
├── steam-config/   # SteamCMD 会话，权限应为 0700
└── trash/          # 删除时的原子移动区域
```

备份前建议暂停 API 和 Worker：

```bash
docker compose -f deploy/docker-compose.yml stop api worker
```

随后备份 `app-data`、`steam-config` 和 `steam-data`，恢复时检查目录所有权，再执行 `up -d`。

## 本地开发

要求 Node.js `>=22.12.0`，包管理器固定为 pnpm `10.32.1`。

```bash
corepack enable
corepack pnpm install
corepack pnpm build
corepack pnpm lint
corepack pnpm test
corepack pnpm test:e2e
```

常用命令：

```bash
corepack pnpm dev              # 并行启动开发服务
corepack pnpm prisma:generate # 生成 Prisma Client
corepack pnpm test:e2e         # Playwright 浏览器测试
```

## 项目结构

```text
apps/
  web/                 React 管理界面与 WebWallGL 预览
  api/                 NestJS API
  worker/              BullMQ Worker 与 SteamCMD
packages/
  contracts/           共享 DTO、状态和错误契约
  database/            Prisma Schema、迁移和共享查询
  wallpaper-files/     路径安全、入口解析、原子发布
  config/              环境变量校验
deploy/                Dockerfile、Compose 和 Nginx 配置
docs/                  部署、DSH 和 Steam 登录文档
tests/                 fixtures、集成测试和 E2E 测试
```

## 验收边界

本项目不承诺同步 Steam 订阅，不下载或运行 Application／EXE，不在树莓派上进行 WebGL 渲染，也不保证所有 Scene／Web 壁纸都能 100% 还原 Wallpaper Engine。

真实 Steam 登录、Guard、工坊下载、Scene 渲染，以及树莓派与 DSH 的完整联动仍需在目标设备验收。更详细的说明见：

- `docs/deployment.md`
- `docs/dsh-integration.md`
- `docs/steam-login.md`
