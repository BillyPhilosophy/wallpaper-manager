# Wallpaper Manager

运行在 ARM64 Linux 设备上的 Wallpaper Engine 创意工坊管理网站。用户可以在浏览器中搜索、下载、预览和删除壁纸，并与同一台机器上的 DSH Wallpaper Engine 插件共享原始壁纸文件，无需重复下载或格式转换。

项目面向 **ARM64 Linux 设备、Docker Compose、无桌面环境和局域网单用户** 场景，树莓派是主要参考部署环境。设备只负责存储、下载和 HTTP 服务，Scene／Web 壁纸的 WebGL 渲染在用户浏览器中完成。

## 项目能做什么

- 使用 Steam 官方接口搜索和浏览创意工坊壁纸。
- 使用 SteamID64 同步订阅列表，已知 SteamID 时无需登录；同步只加入网站，不会自动批量下载，取消订阅也不会删除本地文件。
- 按内容分级和类型多选筛选本地壁纸；下载后以 `project.json` 中的 `contentrating` 和 `type` 为准。
- 查看官方图片、动图、视频及完整元数据。
- 默认使用 Steam 手机 App 扫码登录，也支持账密登录、steamguard-cli 自动令牌和手工 Guard。
- 下载、取消、重试和删除壁纸，展示真实任务阶段、字节占比和平均下载速率；没有可靠数据时不伪造百分比。
- 使用固定版本的 `webwallgl@3.0.0` 在线预览已下载的 Scene／Web 壁纸，支持本地视频播放和全屏预览；引擎运行在隔离的沙箱 iframe 中。
- 搜索支持类型、内容分级和排序；设置页默认过滤成人及未分级内容，可主动关闭。
- 与 DSH 共用同一份原始工坊文件，下载后即可在 DSH 壁纸库中使用。
- 通过暂存目录、资源校验和原子发布，避免网站或 DSH 读取半成品。
- 阻止 Application／EXE 壁纸，不执行壁纸目录中的第三方程序。

Steam Web API Key 和 DepotDownloader 登录是两套独立配置。密码及 Guard 码不会写入数据库、BullMQ 任务或应用日志。

## 服务组成

| 服务 | 作用 | 是否对外暴露 |
|---|---|---|
| `web` | React 静态网站及 `/api` 反向代理 | 是，宿主机端口 `8083` |
| `api` | NestJS API、SQLite、资源读取、任务入队 | 否 |
| `worker` | DepotDownloader 登录、下载、校验、发布和删除 | 否 |
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

同时生成 `sha-<完整提交哈希>` 标签用于回滚。Worker 使用原生 ARM64 的 DepotDownloader 和 steamguard-cli，不再需要 Box64 或 Pi 5 专用镜像。设备端 `deploy/.env` 中的 `DOCKERHUB_USERNAME` 必须与这里一致，否则 Compose 会拉取其他命名空间下的镜像。`STEAM_WEB_API_KEY` 只在设备端配置，不需要也不应添加到 GitHub Actions Secrets。

另一个 `.github/workflows/ci.yml` 会在 push 和 Pull Request 时自动执行类型检查、单元测试、构建和 E2E 测试，不需要 Docker Hub Secrets；它与镜像发布工作流相互独立。

### 获取 Steam Web API Key（必须）

工坊搜索和订阅同步使用 Steam 官方 Web API。请先在 Steam 中注册一个 API Key：

1. 打开 [Steam Web API Key 注册页面](https://steamcommunity.com/dev/apikey)。
2. 登录 Steam，按页面要求填写域名并完成注册。
3. 将生成的 Key 写入设备端的 `deploy/.env`：

```env
STEAM_WEB_API_KEY=替换为你自己的Key
```

Key 只需要配置在服务端，与扫码或账密登录无关，也不需要放入 GitHub Actions Secrets。不要将真实 Key 提交到 Git、写入前端代码或公开发送。若 Key 泄露，请及时更换。

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

### 可选：通过宿主机代理访问 Steam

如果 Steam 直连不稳定，且宿主机已有监听 `0.0.0.0:7890` 的 HTTP／混合代理，在 `deploy/.env` 中取消注释并设置：

```env
HTTP_PROXY=http://host.docker.internal:7890
HTTPS_PROXY=http://host.docker.internal:7890
NO_PROXY=localhost,127.0.0.1,web,api,worker,redis
```

Compose 会将 `host.docker.internal` 映射到宿主机网关。`STEAM_NETWORK_MODE` 支持 `direct`、`proxy`、`auto`：配置代理时默认 `proxy`，未配置时默认 `direct`。`auto` 先进行 5 秒直连探测，成功保持 15 分钟，只在网络错误时切代理；HTTP 状态和认证错误不会触发切换。可用 `STEAM_PROXY_URL` 或 `HTTP_PROXY`/`HTTPS_PROXY` 指定代理，`NO_PROXY` 用于保证容器内部通信不经过代理。修改后需要重建 API 和 Worker 容器。

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

Worker 镜像内置固定版本的原生 ARM64 DepotDownloader 和 steamguard-cli。DepotDownloader 从固定源码构建，仅通过 `deploy/depotdownloader-progress.patch` 增加真实字节进度输出，不改变下载算法。镜像构建成功不代表 Steam 已完成实机验收，仍需测试真实登录、自动 Guard 和下载。配置方法见 `docs/steam-login.md`。

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

## 日常使用引导

### 登录与订阅

- 打开“Steam 设置”，推荐使用 Steam 手机 App 扫码登录；也支持账密、手机确认和 Guard 流程。
- 打开“订阅同步”，填写并保存 SteamID64 后即可同步订阅。该操作不要求 Steam 登录，也不会自动批量下载。
- 自动手机令牌和 maFiles 的安全配置见 [Steam 登录与安全](docs/steam-login.md)。

### 搜索与预览

- 工坊搜索支持关键词、类型、内容分级和排序，支持输入页码跳转。
- 默认开启内容过滤，只显示全年龄和 PG13，排除成人及未分级项目；可在“Steam 设置 → 搜索内容过滤”中关闭。
- 搜索页会保存筛选、页码和滚动位置；搜索与壁纸库的筛选状态相互独立。
- 已下载的 Scene/Web 可启动沙箱实时预览，视频可直接播放；预览区域支持全屏。

### 下载与删除

- 下载中心显示真实字节进度、占比和速率，支持取消、失败重试和历史记录分页。
- 失败、已取消和已完成记录可以单项删除；失败记录和已完成记录也可分别清空。
- 删除记录时默认只移除任务历史。勾选“同时删除本地源文件及所有关联记录”后，会展示受影响的壁纸，并通过 Worker 永久删除源文件和关联记录。
- 从壁纸库删除已下载文件时，也会清理其关联任务；没有任务记录时仍可正常删除文件。
- 源文件删除不可撤销，但不会取消 Steam 订阅。请提前备份重要文件。

## 数据目录

以下目录均位于 `deploy/.env` 配置的 `WALLPAPER_DATA_ROOT` 下：

```text
/srv/wallpaper-manager/
├── app-data/       # SQLite 数据库
├── staging/        # 下载暂存，校验前不会进入正式壁纸库
├── steam-data/     # 网站 Worker 与 DSH 共享的原始壁纸文件
├── steam-config/   # DepotDownloader 会话与 steamguard-cli maFiles，权限应为 0700
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
  worker/              BullMQ Worker 与 DepotDownloader
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

本项目不下载或运行 Application／EXE，不在 ARM64 设备上进行 WebGL 渲染，也不保证所有 Scene／Web 壁纸都能 100% 还原 Wallpaper Engine。订阅同步不是自动批量下载，也不承诺同步收藏、点赞或 Wallpaper Engine 播放配置。

真实 Steam 登录、Guard、订阅同步、工坊下载、Scene 渲染，以及树莓派与 DSH 的完整联动仍需在目标设备验收。更详细的说明见：

- [部署指南](docs/deployment.md)
- [DSH 接入](docs/dsh-integration.md)
- [Steam 登录与安全](docs/steam-login.md)

## 发布与变更记录

版本变化记录在 [CHANGELOG.md](CHANGELOG.md)。发布新版本前，将 `Unreleased` 中的内容整理到新的版本号和日期下，同步更新 `package.json`，完成测试后再创建 Git 标签和 GitHub Release。镜像发布使用 GitHub Actions 中的手动 `build-images` 工作流。

## 鸣谢

- [dsh-wallpaper-engine](https://github.com/elysia395/dsh-wallpaper-engine)：为项目的 DSH 联动和壁纸管理体验提供了开发灵感。
- [DepotDownloader](https://github.com/SteamRE/DepotDownloader)：提供 Steam 登录与工坊下载能力。
- [steamguard-cli](https://github.com/dyc3/steamguard-cli)：提供可选的手机令牌自动化能力。
- [WebWallGL](https://github.com/oneincase/webwallgl)：提供浏览器中的 Wallpaper Engine 场景渲染能力。

## 许可证

本项目使用 [MIT License](LICENSE)。使用或修改本项目时，请保留许可证中的版权与许可声明。
