# Wallpaper Manager

运行在树莓派上的 Wallpaper Engine 创意工坊管理网站。用户可以在浏览器中搜索、下载、预览和删除壁纸，并与同一台机器上的 DSH Wallpaper Engine 插件共享原始壁纸文件，无需重复下载或格式转换。

项目面向 **ARM64 树莓派、Docker Compose、无桌面环境和局域网单用户** 场景。树莓派只负责存储、下载和 HTTP 服务，Scene／Web 壁纸的 WebGL 渲染在用户浏览器中完成。

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

### 1. 发布 ARM64 镜像

在 GitHub 仓库的 **Settings → Secrets and variables → Actions** 中配置：

```text
DOCKERHUB_USERNAME   Docker Hub 用户名
DOCKERHUB_TOKEN      Docker Hub Access Token，不要使用账号密码
```

在 Actions 页面手动运行 **build-images** 工作流。工作流会构建 `linux/arm64` 镜像，并分别推送：

```text
<用户名>/wallpaper-manager-web:latest
<用户名>/wallpaper-manager-api:latest
<用户名>/wallpaper-manager-worker:latest
```

同时生成 `sha-<完整提交哈希>` 标签用于回滚。

### 2. 准备树莓派目录

安装 Docker Engine 和 Docker Compose v2，然后创建持久化目录：

```bash
sudo install -d -o 1000 -g 1000 -m 0755 \
  /srv/wallpaper-manager/{app-data,staging,steam-data,steam-config,trash}

sudo chmod 0700 /srv/wallpaper-manager/steam-config
findmnt -T /srv/wallpaper-manager
```

`staging`、`steam-data` 和 `trash` 必须位于同一文件系统。容器使用 UID/GID `1000:1000`，请确保 DSH 用户能够读取 `steam-data`，不要使用 root-only 权限或直接开放 `0777`。

### 3. 启动服务

将项目的 `deploy/docker-compose.yml` 下载到树莓派，在该文件所在目录执行：

```bash
export DOCKERHUB_USERNAME='你的Docker Hub用户名'
export STEAM_WEB_API_KEY='你的Steam Web API Key'

docker compose pull
docker compose up -d
docker compose ps
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
docker compose pull
docker compose up -d
```

回滚到指定提交：

```bash
export IMAGE_TAG='sha-<完整提交哈希>'
docker compose pull
docker compose up -d
```

## 从源码构建部署

在树莓派上取得完整源码后执行：

```bash
sudo install -d -o 1000 -g 1000 -m 0755 \
  /srv/wallpaper-manager/{app-data,staging,steam-data,steam-config,trash}
sudo chmod 0700 /srv/wallpaper-manager/steam-config

cd deploy
STEAM_WEB_API_KEY='你的Steam Web API Key' docker compose up -d --build
```

Worker 镜像在 ARM64 上通过 Box64 运行官方 SteamCMD。镜像构建成功不代表 SteamCMD 已完成实机验收，仍需测试真实登录、Guard 和下载。

## DSH 接入

如果 DSH 也使用 Docker Compose，为其增加只读挂载和环境变量：

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
docker compose stop api worker
```

随后备份 `app-data`、`steam-config` 和 `steam-data`，恢复时检查目录所有权，再执行 `docker compose up -d`。

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
