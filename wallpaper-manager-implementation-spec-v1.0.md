# Wallpaper Manager 实施规格书

- 文档状态：Frozen v1.0，可直接用于多 Agent 并行实施
- 目标平台：树莓派 ARM64、Docker Compose、无桌面环境
- DSH 插件：`elysia395/dsh-wallpaper-engine`
- 插件核对基线：仓库 `main`，包版本 `1.4.0`，提交 `cde8e9c66972f47f6d369f5e51484ca8fa48c9b5`
- 网站渲染引擎：固定 `webwallgl@3.0.0`

> 本文件是 MVP 的唯一实施基线。任何 Agent 不得自行更换目录契约、队列语义、认证边界或渲染引擎。确需变更时，先提交变更说明并同步修改本文件及相关测试。

---

## 1. 产品目标

建设一个运行在树莓派上的 Wallpaper Engine 工坊管理网站，并与同一台机器上的 DSH Wallpaper Engine 插件共享壁纸文件。

用户可以在浏览器中完成：

1. 搜索和浏览 Steam 创意工坊壁纸；
2. 查看 Steam 官方图片、动图、视频及元数据；
3. 配置 DepotDownloader 登录并处理 Steam Guard；
4. 下载、重试、取消和删除壁纸；
5. 对已下载的 Scene／Web 壁纸进行真实在线预览；
6. 在 DSH 壁纸库中直接使用同一份已下载文件，无需二次下载或格式转换。

### 1.1 核心原则

- 原始工坊目录是唯一内容真源，数据库只保存索引和任务状态。
- 网站 Worker 与 DSH 必须看到同一份宿主机壁纸文件。
- 下载先进入 staging，校验后原子发布，任何消费者都不能看到半成品。
- 网站和 DSH 使用一致的 WebWallGL 版本。
- 树莓派只负责存储、下载和 HTTP 服务；WebGL 渲染发生在用户浏览器。
- 不执行第三方 Application／EXE，不默认解包 `scene.pkg`。

---

## 2. 已冻结的技术决策

| 领域 | 决策 |
|---|---|
| 前端 | React、TypeScript、Vite |
| 后端 | NestJS、TypeScript |
| 数据库 | SQLite，使用 Prisma 管理 Schema 与迁移 |
| 下载队列 | BullMQ |
| 队列存储 | Redis，开启 AOF |
| 下载器 | Worker 镜像内置树莓派 ARM64 可用的 DepotDownloader 运行环境 |
| 实时渲染 | `webwallgl@3.0.0`，使用 `save-exact` 固定 |
| 部署 | Docker Compose |
| 包管理 | pnpm workspace，锁文件必须提交 |
| Node.js | `>=22.12.0` |
| DSH 兼容基线 | `^0.2.0-rc.1` |
| 服务渲染 | 不使用 Chromium、Xvfb、GPU 或桌面环境 |
| Docker 控制 | 不挂载 `/var/run/docker.sock` |
| 格式转换 | 默认链路不包含 RePKG |
| 默认部署范围 | 局域网单用户，不在 MVP 中实现多租户和权限体系 |

### 2.1 明确不做

- 不承诺同步用户的 Steam 订阅列表。
- 不下载或运行 Application／EXE 壁纸。
- 不在树莓派上渲染壁纸画面。
- 不将 Steam 密码写入数据库、环境文件、任务参数或日志。
- 不通过挂载 Docker Socket 启动辅助容器。
- 不在下载前伪造 WebWallGL 实时预览。
- 不保证所有 Scene／Web 壁纸 100% 还原 Wallpaper Engine。
- 不在 MVP 中实现创意工坊上传、编辑、合集管理和自动更新。

---

## 3. 总体架构

```text
浏览器
  ├── React 管理界面
  ├── Steam 官方预览
  └── WebWallGL 实时预览（仅已下载内容）
          │ HTTP
          ▼
Web 静态服务 / 反向代理
          │
          ▼
NestJS API
  ├── 工坊搜索与元数据缓存
  ├── 壁纸索引与任务 API
  ├── 安全资源服务
  └── SQLite
          │ BullMQ
          ▼
Redis ◄──── Worker
                ├── DepotDownloader 登录与会话
                ├── 下载到 staging
                ├── 校验 project.json 与资源
                ├── 原子发布到 Workshop 根
                └── 回写任务和索引状态

宿主机共享目录
  /srv/wallpaper-manager/steam-data
          ├── 网站 API：只读挂载
          ├── 网站 Worker：读写挂载
          └── DSH：读取并扫描同一目录
```

### 3.1 服务划分

- `web`：前端构建产物和反向代理。
- `api`：NestJS API、SQLite、资源读取、BullMQ 任务入队。
- `worker`：DepotDownloader、下载、校验、发布和删除。
- `redis`：BullMQ 队列与短期缓存。
- `dsh`：不作为本项目 Compose 的必填服务，由既有 DSH 部署按本文挂载契约接入。

---

## 4. 文件系统契约（不可更改）

### 4.1 宿主机目录

```text
/srv/wallpaper-manager/
├── staging/
│   └── <jobId>/
│       └── steamapps/
│           └── workshop/
│               └── content/
│                   └── 431960/
│                       └── <workshopId>/
└── steam-data/
    └── steamapps/
        └── workshop/
            └── content/
                └── 431960/
                    └── <workshopId>/
                        ├── project.json
                        ├── scene.pkg、scene.json 或网页入口
                        ├── preview 文件
                        └── 其他原始工坊资源
```

另设独立持久化目录：

```text
/srv/wallpaper-manager/app-data/     # SQLite、应用配置
/srv/wallpaper-manager/steam-config/ # DepotDownloader 会话与受保护的 steamguard-cli maFiles
/srv/wallpaper-manager/trash/        # 删除时的原子移入区域
```

权限要求：

- `staging`、`steam-data`、`trash` 必须位于同一文件系统。
- Worker 对以上目录有写权限。
- API 对 `steam-data` 只需要读权限。
- DSH 不挂载 `staging`、`app-data` 或 `steam-config`。
- 部署文档必须说明 UID／GID，禁止产生普通用户和 DSH 无法读取的 root-only 文件。

### 4.2 容器内路径

网站 Worker：

```bash
MANAGER_ROOT=/wallpaper-manager
STAGING_DIR=/wallpaper-manager/staging
STEAM_ROOT=/wallpaper-manager/steam-data
TRASH_DIR=/wallpaper-manager/trash
STEAM_CONFIG_DIR=/steam-config/depotdownloader
```

网站 API：

```bash
STEAM_ROOT=/wallpaper-manager/steam-data
DATABASE_URL=file:/app-data/wallpaper-manager.db
REDIS_URL=redis://redis:6379
```

派生路径只能由后端统一函数计算：

```text
WORKSHOP_ROOT=<STEAM_ROOT>/steamapps/workshop/content/431960
```

禁止各模块自行拼接另一套根目录。

### 4.3 DSH 配置

DSH 容器挂载示例：

```yaml
services:
  dsh:
    # 既有 DSH 镜像和其他配置保持不变
    volumes:
      - /srv/wallpaper-manager/steam-data:/wallpaper-manager/steam-data:ro
    environment:
      DSH_WE_STEAM_ROOT: /wallpaper-manager/steam-data
```

若 DSH 直接运行在宿主机：

```bash
DSH_WE_STEAM_ROOT=/srv/wallpaper-manager/steam-data
```

注意：

- 变量必须指向包含 `steamapps/` 的 Steam 根。
- 不得指向 `431960` 或 Wallpaper Engine 安装目录。
- 对该显式根目录，只要 `<root>/steamapps/workshop/content/431960` 存在即可被识别为扫描库。
- 不需要伪造 `libraryfolders.vdf`。
- DSH 清单入口为 `/wallpaper-engine/inventory`。
- 产品文案不得承诺“固定 30 秒自动出现”；验收时打开或刷新 DSH 壁纸库，由清单请求触发重建。

---

## 5. Docker Compose 基线

以下为挂载和依赖关系的基线，实施 Agent 可补齐构建阶段、健康检查和镜像标签，但不得改变路径和权限边界。

```yaml
services:
  web:
    build:
      context: .
      dockerfile: deploy/web.Dockerfile
    depends_on:
      - api
    ports:
      - "8083:80"
    restart: unless-stopped

  api:
    build:
      context: .
      dockerfile: deploy/api.Dockerfile
    environment:
      NODE_ENV: production
      DATABASE_URL: file:/app-data/wallpaper-manager.db
      REDIS_URL: redis://redis:6379
      STEAM_ROOT: /wallpaper-manager/steam-data
      STEAM_WEB_API_KEY: ${STEAM_WEB_API_KEY:-}
    volumes:
      - /srv/wallpaper-manager/app-data:/app-data
      - /srv/wallpaper-manager/steam-data:/wallpaper-manager/steam-data:ro
    depends_on:
      - redis
    restart: unless-stopped

  worker:
    build:
      context: .
      dockerfile: deploy/worker.Dockerfile
    environment:
      NODE_ENV: production
      DATABASE_URL: file:/app-data/wallpaper-manager.db
      REDIS_URL: redis://redis:6379
      MANAGER_ROOT: /wallpaper-manager
      STAGING_DIR: /wallpaper-manager/staging
      STEAM_ROOT: /wallpaper-manager/steam-data
      TRASH_DIR: /wallpaper-manager/trash
      STEAM_CONFIG_DIR: /steam-config
    volumes:
      - /srv/wallpaper-manager/app-data:/app-data
      - /srv/wallpaper-manager:/wallpaper-manager
      - /srv/wallpaper-manager/steam-config:/steam-config
    depends_on:
      - redis
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    command: ["redis-server", "--appendonly", "yes"]
    volumes:
      - redis-data:/data
    restart: unless-stopped

volumes:
  redis-data:
```

约束：

- SQLite 备份和迁移由 API／迁移任务负责，不能让多个进程同时执行迁移。
- Worker 下载并发默认 `1`，避免 DepotDownloader 会话冲突和树莓派 IO 抖动。
- 所有服务必须支持 ARM64；Worker 必须在真实树莓派上验证 DepotDownloader，而非只做 x86 构建测试。
- 不在 Compose 中声明 Xvfb、Chromium、Docker Socket 或宿主机 GPU。

---

## 6. Monorepo 与模块边界

```text
apps/
  web/                  # React 页面与预览组件
  api/                  # NestJS API
  worker/               # BullMQ Worker 与 DepotDownloader
packages/
  contracts/            # API DTO、枚举、错误码、事件类型
  database/             # Prisma Schema、迁移、共享查询
  wallpaper-files/      # 路径计算、project.json 解析、安全校验
  config/               # 共享环境变量 Schema
deploy/
  web.Dockerfile
  api.Dockerfile
  worker.Dockerfile
  docker-compose.yml
docs/
  deployment.md
  dsh-integration.md
  steam-login.md
tests/
  fixtures/
  integration/
  e2e/
```

依赖规则：

- `web` 只能依赖 `contracts`，不得依赖 Prisma 或 Node 文件系统模块。
- `api` 和 `worker` 可依赖 `database`、`wallpaper-files`、`contracts`。
- DepotDownloader 调用只能存在于 `worker`。
- WebWallGL 只能由 `web` 使用。
- 所有路径安全校验集中在 `wallpaper-files`，禁止在 Controller 中临时实现。

---

## 7. 数据模型

以下为逻辑模型，字段可按 Prisma 命名规范调整，但语义不得删减。

### 7.1 Wallpaper

| 字段 | 类型 | 说明 |
|---|---|---|
| `workshopId` | string，主键 | 仅十进制数字 |
| `title` | string | 当前标题 |
| `description` | text，可空 | 元数据描述 |
| `type` | enum | `scene/web/video/application/unknown` |
| `officialPreviewUrl` | string，可空 | Steam 官方预览 |
| `metadataJson` | JSON | 最近一次完整元数据快照 |
| `localRelativePath` | string，可空 | 只允许 `<workshopId>` |
| `status` | enum | 见状态机 |
| `fileSizeBytes` | bigint，可空 | 发布后的目录大小 |
| `lastErrorCode` | string，可空 | 最近一次机器可读错误 |
| `lastErrorMessage` | string，可空 | 脱敏后的用户可读错误 |
| `downloadedAt` | datetime，可空 | 首次成功发布时间 |
| `createdAt/updatedAt` | datetime | 审计字段 |

### 7.2 DownloadJob

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | UUID，主键 | 同时作为 staging 目录名 |
| `workshopId` | string，外键 | 对应 Wallpaper |
| `status` | enum | `queued/downloading/verifying/publishing/succeeded/failed/cancelled` |
| `attempt` | integer | 当前尝试次数 |
| `errorCode/errorMessage` | 可空 | 必须脱敏 |
| `createdAt/startedAt/finishedAt` | datetime，可空 | 任务时间线 |

### 7.3 状态机

```text
not_downloaded
  └── queued
        └── downloading
              └── verifying
                    └── publishing
                          └── downloaded
```

- 活跃任务可进入 `failed` 或 `cancelled`。
- `failed/cancelled` 可以重新入队。
- `downloaded` 删除时进入 `deleting`，成功后回到 `not_downloaded`。
- API 与 Worker 更新状态必须使用条件更新，防止取消操作与完成回调互相覆盖。
- 有真实字节计数时显示下载占比、已下载/总字节数和平均速率；没有可靠总量时只显示阶段，不伪造百分比。

### 7.4 不保存的内容

- Steam 密码。
- Steam Guard 验证码。
- 可直接在日志中泄露会话的命令行文本。
- 数据库中的 DepotDownloader 明文会话凭据。

---

## 8. API 契约

统一前缀：`/api`。

统一错误结构：

```json
{
  "code": "STEAM_AUTH_REQUIRED",
  "message": "需要先完成 Steam 登录",
  "requestId": "uuid"
}
```

错误消息不得包含密码、Guard 码、完整命令行或会话文件内容。

### 8.1 系统

```http
GET /api/health
GET /api/system/capabilities
```

`capabilities` 至少返回：

```json
{
  "workerReady": true,
  "steamAuthenticated": false,
  "livePreviewTypes": ["scene", "web"],
  "webwallglVersion": "3.0.0"
}
```

### 8.2 工坊搜索

```http
GET /api/workshop/search?q=<text>&cursor=<cursor>&pageSize=20
GET /api/workshop/items/:workshopId
```

要求：

- 使用 Steam 官方接口，不抓取 DeepSeek、第三方壁纸站或网页 HTML 作为元数据源。
- `STEAM_WEB_API_KEY` 只存在服务端，绝不返回浏览器。
- Steam Web API Key 与 DepotDownloader 登录是两套独立配置；订阅同步只依赖 API Key 和 SteamID64，已知 SteamID 时无需登录。
- 搜索响应保留 Steam 分页游标，不自行伪造游标。
- 对官方元数据和预览地址做短期缓存，并处理限流。
- 搜索阶段只返回官方预览和 `not_downloaded/downloaded` 等本地状态，不返回虚构的实时预览地址。

### 8.3 DepotDownloader 登录

```http
GET  /api/steam/auth/status
POST /api/steam/auth/login
POST /api/steam/auth/guard
POST /api/steam/auth/logout
```

登录请求：

```json
{
  "username": "steam-user",
  "password": "仅请求体内短时使用"
}
```

Guard 请求：

```json
{
  "code": "仅请求体内短时使用"
}
```

实现约束：

- 密码和 Guard 码不得进入 BullMQ payload、SQLite、应用日志和错误堆栈。
- 通过受控 stdin 与 DepotDownloader 交互，禁止把密码拼入命令行参数。
- 默认通过 DepotDownloader `-qr` 提供手机扫码登录；二维码只保存在 Worker 内存，自动刷新且五分钟过期，不进入数据库、队列或日志。
- 账密登录按上游要求区分手机确认、手机令牌码和邮箱验证码；只有手机令牌码使用 steamguard-cli 自动产码，失败时保留手工输入。
- steamguard-cli maFiles 包含长期 2FA 密钥，只能保存在 `steam-config` 卷并限制权限；passkey 通过受保护文件读取，不进入命令行。
- 登录状态由 Worker 统一管理，API 仅通过内部 HTTP 转发登录请求，不把秘密写入队列。
- `STEAM_NETWORK_MODE` 支持 `direct/proxy/auto`，配置代理时默认 `proxy`；`auto` 使用 5 秒直连探测和 15 分钟粘性选择，仅网络错误触发代理切换，HTTP 状态和认证错误不切换。
- 支持 `authenticated/auth_required/guard_required/email_required/confirmation_required/qr_required/error` 状态。
- 持久化非敏感的账号名和 SteamID64，Worker 重启后使用 DepotDownloader refresh token，不再以内存认证状态阻止下载。
- 会话失效后返回明确重新登录状态，不能无限重试。

### 8.4 壁纸与任务

```http
GET    /api/wallpapers?q=&type=&status=&page=1&pageSize=24
GET    /api/wallpapers/:workshopId
POST   /api/wallpapers/:workshopId/download
POST   /api/downloads/:jobId/cancel
POST   /api/downloads/:jobId/retry
DELETE /api/wallpapers/:workshopId
GET    /api/downloads/:jobId
GET    /api/downloads?status=&page=1&pageSize=20
```

下载入队规则：

- `workshopId` 必须匹配 `^[0-9]+$`。
- 同一壁纸最多存在一个活跃下载任务。
- 已下载壁纸默认不重复下载，重复请求返回当前状态。
- 取消下载必须终止对应 DepotDownloader 子进程，再清理该任务 staging。
- 重试使用新 `jobId`，保留历史任务用于诊断。

删除规则：

1. 确认没有活跃任务；
2. 将 `<workshopId>` 原子移动到 `trash/<deleteJobId>/<workshopId>`；
3. 更新数据库状态；
4. 异步彻底删除 trash 内容；
5. 任一步失败都要可恢复，不能直接留下数据库与文件系统互相矛盾的状态。

### 8.5 本地资源与实时预览

```http
GET /api/wallpapers/:workshopId/preview-descriptor
GET /api/wallpapers/:workshopId/resources/*
```

`preview-descriptor` 示例：

```json
{
  "workshopId": "1234567890",
  "mode": "webwallgl",
  "type": "scene",
  "resourceBaseUrl": "/api/wallpapers/1234567890/resources",
  "entry": "scene.pkg",
  "fallbackPreviewUrl": "https://...",
  "degraded": false,
  "message": null
}
```

不支持时：

```json
{
  "workshopId": "1234567890",
  "mode": "official-preview",
  "type": "application",
  "fallbackPreviewUrl": "https://...",
  "degraded": true,
  "message": "该类型不支持浏览器实时预览"
}
```

资源服务必须：

- 先解析并校验相对路径，禁止 `..`、绝对路径、编码绕过和符号链接逃逸。
- 拒绝读取 Workshop 根之外的文件。
- 支持常见媒体 Range 请求和正确 MIME。
- 提供 WebWallGL 所需的同源或显式 CORS 响应。
- 不把 `STEAM_ROOT` 的物理路径泄露到浏览器。

---

## 9. 下载 Worker 实施要求

### 9.1 标准流程

```text
领取任务
  → 检查 Steam 会话
  → 创建 staging/<jobId>
  → DepotDownloader 下载
  → 定位唯一的 431960/<workshopId>
  → 校验目录与 project.json
  → 识别壁纸类型和支持能力
  → 计算大小并生成索引
  → 确认目标目录不存在或处于可恢复状态
  → 原子重命名到正式 Workshop 根
  → 数据库标记 downloaded/succeeded
  → 清理 staging
```

### 9.2 校验规则

- 必须存在且只定位到当前 `workshopId` 的目录。
- `project.json` 必须是合法 JSON，并能确定入口或明确归类为 `unknown`。
- Scene 接受原始声明文件、`scene.pkg`、`scene.json` 或符合插件规则的唯一 `.pkg`。
- Web 必须定位声明的网页入口，但不得在 Worker 中执行其脚本。
- Application／EXE 不进入正式目录，任务以 `UNSUPPORTED_TYPE` 结束。
- 所有路径必须限制在下载目录内，拒绝路径穿越和危险符号链接。
- 下载结果为空、入口缺失或关键资源不完整时不得发布。

### 9.3 失败与恢复

- 任何失败都先记录脱敏错误，再清理或隔离当前 `jobId` 的 staging。
- Worker 重启后，活跃任务必须恢复为可重试状态，不能永久停留在 `downloading`。
- 发布采用原子 rename；不得直接向正式目录流式写入。
- 同一 DepotDownloader 会话默认串行使用。
- 捕获并分类：登录失效、Guard 要求、限流、网络错误、磁盘不足、下载超时、内容不支持、校验失败。

建议错误码：

```text
STEAM_AUTH_REQUIRED
STEAM_GUARD_REQUIRED
STEAM_RATE_LIMITED
STEAM_DOWNLOAD_FAILED
DOWNLOAD_TIMEOUT
DISK_FULL
WORKSHOP_ITEM_NOT_FOUND
UNSUPPORTED_TYPE
INVALID_PROJECT
RESOURCE_MISSING
PATH_UNSAFE
PUBLISH_CONFLICT
CANCELLED
INTERNAL_ERROR
```

---

## 10. 前端实施要求

### 10.1 页面

1. **工坊搜索**：关键词、分页、官方预览、标题、类型、下载状态。
2. **壁纸详情**：完整元数据、官方预览、本地下载状态、实时预览入口。
3. **我的壁纸**：状态与类型过滤、搜索、删除、重新查看任务。
4. **下载中心**：阶段、错误、重试、取消，不伪造进度。
5. **Steam 设置**：API Key 配置状态、DepotDownloader 登录、Guard 输入、会话状态。

API Key 若仅支持环境变量，界面只显示“已配置／未配置”，不提供读取原值的接口。

### 10.2 预览规则

- 未下载：只显示 Steam 官方图、动图或视频。
- 已下载 Scene／Web：允许进入真实预览。
- 已下载其他类型：显示官方预览或不支持说明。
- WebWallGL 初始化失败：自动回退到官方预览并显示降级原因。
- 切换路由、壁纸或卸载组件时必须调用 `release()`，释放 WebGL、音频和事件监听。
- Web 壁纸使用独立沙箱容器，不得获得管理网站 DOM、存储或 API 的任意访问权。

### 10.3 WebWallGL 适配器

网站直接安装：

```bash
pnpm add --save-exact webwallgl@3.0.0
```

前端只允许通过适配器使用引擎，例如：

```ts
interface LivePreviewAdapter {
  mount(container: HTMLElement, descriptor: PreviewDescriptor): Promise<void>;
  unmount(): Promise<void>;
}
```

实现要求：

- 使用 WebWallGL 公开 API，不复制 DSH 插件内部适配层。
- 资源通过本站 `resourceBaseUrl` 加载。
- 组件卸载幂等，重复 `unmount()` 不抛错。
- 页面不可见时暂停或降低资源消耗。
- 版本升级必须与目标 DSH 插件锁文件重新对齐，不允许前端单独升级。

---

## 11. DSH 集成验收

### 11.1 静态检查

- DSH 使用正确的 `DSH_WE_STEAM_ROOT`。
- `<root>/steamapps/workshop/content/431960` 存在。
- DSH 没有挂载 staging。
- 不需要 `libraryfolders.vdf`。
- 无 GUI 环境不启动 Xvfb。
- 插件的 X11 依赖只可能影响遮挡检测，不作为核心功能失败处理。

### 11.2 端到端检查

1. 网站下载一个已知 Scene 测试壁纸；
2. 确认正式目录中含原始 `project.json` 和资源；
3. 确认网站能够实时预览；
4. 打开或刷新 DSH 壁纸库；
5. 调用 `/wallpaper-engine/inventory` 确认项目出现；
6. 在 DSH 中选中并渲染同一壁纸；
7. 从网站删除后刷新 DSH，确认项目消失；
8. 全程确认 DSH 未观察到 staging 半成品。

### 11.3 版本对齐

当前基线是插件 `1.4.0` 锁定 WebWallGL `3.0.0`。部署检查必须输出：

```bash
# 网站
pnpm why webwallgl

# DSH 实际安装目录
# 检查其 package.json 与 lock 文件中的 webwallgl 版本
```

若用户实际安装插件不是本基线，先以实际安装包为准更新本规格，再实施版本对齐。

---

## 12. 安全基线

- 默认只监听局域网，不直接暴露到公网。
- Steam API Key 只存服务端环境变量或受保护配置。
- Steam 密码与 Guard 码只在登录请求和受控进程输入中短暂存在。
- 日志默认脱敏，禁止记录授权请求体。
- 所有 `workshopId`、资源路径和任务 ID 都进行白名单校验。
- 不执行壁纸目录中的任何程序、安装脚本或 shell 命令。
- Web 壁纸与管理前端隔离，至少使用独立 `iframe` sandbox 和最小权限策略。
- 资源服务防路径穿越、符号链接逃逸和任意文件读取。
- 限制请求体、搜索频率、下载队列长度和磁盘占用。
- Docker 容器不挂载 Docker Socket，不使用特权模式。

---

## 13. 测试要求

### 13.1 单元测试

- 路径派生和 `workshopId` 校验。
- `project.json` 类型识别。
- Scene／Web 入口解析。
- 路径穿越、编码路径和符号链接攻击。
- 状态机与重复下载约束。
- 错误脱敏。
- Preview Descriptor 的支持与降级分支。
- React 预览组件卸载时调用 `release()`。

### 13.2 集成测试

使用 `tests/fixtures`，不得依赖每次运行都访问 Steam：

- 有效 Scene 原始目录可直接发布。
- 缺失 `project.json` 被拒绝。
- Application 被排除。
- 下载失败不进入正式目录。
- 取消后 staging 被清理。
- 重启后任务可恢复。
- 删除采用原子移动，不出现半删除状态。
- API 不能读取 Workshop 根之外的文件。

### 13.3 ARM64 实机验收

必须在目标树莓派完成：

- `docker compose up -d` 全部服务健康。
- DepotDownloader 能启动并处理登录／Guard。
- 完成一次真实搜索和下载。
- 网站 Scene 实时预览可用。
- DSH 清单和实际渲染可用。
- 取消、重试、删除至少各验证一次。
- 检查日志无明文密码和 Guard 码。
- 检查系统无 Xvfb／Chromium 服务进程。
- 重启树莓派后数据库、队列和已下载内容仍可恢复。

---

## 14. MVP 完成定义

以下项目全部通过才算完成：

- [ ] 搜索、详情和官方预览可用。
- [ ] Steam Web API Key 不泄露到浏览器。
- [ ] DepotDownloader 登录、Guard 和会话失效流程可用。
- [ ] 下载只写 staging，校验后原子发布。
- [ ] 同一壁纸不会重复并发下载。
- [ ] Scene／Web 使用固定 WebWallGL 版本在线预览。
- [ ] 不支持或渲染失败时有官方预览降级。
- [ ] DSH 从同一目录发现并使用壁纸，无需 RePKG。
- [ ] 删除后网站和 DSH 状态一致。
- [ ] 树莓派 ARM64、无 GUI 环境通过实机验收。
- [ ] 没有 Docker Socket、Xvfb、服务端浏览器或 Application 执行路径。
- [ ] 单元、集成、E2E 测试和安全检查通过。
- [ ] 部署、DSH 接入、Steam 登录文档齐全。

---

## 15. 多 Agent 分工与交付边界

### Agent 0：架构与契约整合

负责：

- 初始化 pnpm workspace、TypeScript、lint、测试和 CI。
- 落地 `packages/contracts`、`packages/config`。
- 审核跨模块接口变更和最终集成。

不得：独自修改其他 Agent 已完成的业务实现而不更新契约测试。

### Agent 1：数据库与核心 API

拥有：

- `packages/database`
- `packages/wallpaper-files`
- `apps/api` 的壁纸、任务、资源模块

交付：

- Prisma Schema 和迁移。
- 状态机、壁纸 API、任务 API。
- 安全资源服务与单元／集成测试。

### Agent 2：Steam 元数据与认证 API

拥有：

- `apps/api` 的 Workshop 搜索模块。
- Steam 认证控制面，与 Worker 的认证状态接口。

交付：

- 官方搜索、详情、缓存、限流处理。
- API Key 服务端保护。
- 不含秘密的认证控制契约。

依赖：与 Agent 3 先冻结认证状态和控制消息，不得传递密码到队列。

### Agent 3：DepotDownloader Worker

拥有：

- `apps/worker`
- `deploy/worker.Dockerfile`

交付：

- ARM64 DepotDownloader 运行环境。
- 登录／Guard 交互、下载、取消、校验、原子发布、删除。
- 失败恢复和错误分类测试。

依赖：`wallpaper-files`、数据库模型、认证控制契约。

### Agent 4：React 管理界面

拥有：

- `apps/web` 除 `features/live-preview` 外的模块。

交付：

- 搜索、详情、我的壁纸、下载中心、Steam 设置页面。
- 状态轮询或订阅、错误与空状态。
- 响应式界面和前端测试。

依赖：只使用 `packages/contracts`，通过 API mock 与后端并行开发。

### Agent 5：WebWallGL 预览

拥有：

- `apps/web/src/features/live-preview`
- Web 壁纸沙箱相关组件

交付：

- `webwallgl@3.0.0` 适配器。
- Scene／Web 预览、降级和资源释放。
- 不支持类型与 WebGL 失败测试。

依赖：Preview Descriptor 契约，不依赖 DSH 私有代码。

### Agent 6：部署与 DSH 接入

拥有：

- `deploy/` 中除 Worker Dockerfile 外的文件。
- `docs/deployment.md`
- `docs/dsh-integration.md`

交付：

- ARM64 Compose、健康检查、卷权限和备份说明。
- DSH 环境变量与只读挂载示例。
- 版本对齐检查脚本。

不得：引入 Docker Socket、Xvfb 或伪 `libraryfolders.vdf`。

### Agent 7：QA 与安全验收

拥有：

- `tests/e2e`
- `tests/integration`
- 安全测试与实机验收报告

交付：

- 契约测试、异常链路、路径安全和日志脱敏检查。
- 树莓派 + 网站 + DSH 的完整验收。

---

## 16. 并行开发顺序

### 阶段 A：契约冻结

Agent 0 牵头，Agent 1／2／3／4／5 确认：

- DTO 和错误码；
- 数据库状态机；
- 认证控制消息；
- Preview Descriptor；
- 环境变量与目录函数。

阶段 A 未合并前，其他 Agent 只在各自目录工作，不修改共享契约。

### 阶段 B：并行实现

- Agent 1：数据库、核心 API、资源服务。
- Agent 2：搜索与认证控制面。
- Agent 3：Worker 和 DepotDownloader。
- Agent 4：使用 mock API 开发页面。
- Agent 5：使用 fixture descriptor 开发预览。
- Agent 6：Compose、部署文档、DSH 接入。

### 阶段 C：集成

按以下顺序合并：

```text
contracts/config
  → wallpaper-files/database
  → API 与 Worker
  → Web 与 Live Preview
  → Compose 与 DSH
  → E2E 和安全修复
```

每个 PR 必须包含测试；跨模块 PR 必须更新契约测试和部署文档。

---

## 17. 实施基线来源

DSH 插件仓库：

```text
https://github.com/elysia395/dsh-wallpaper-engine
```

本次核对提交：

```text
cde8e9c66972f47f6d369f5e51484ca8fa48c9b5
```

重点源码依据：

- `docs/HOW-IT-WORKS.md`：Steam 根、扫描路径与路由分工。
- `lib/steam-discovery.js`：显式 Steam 根和 Workshop 目录识别。
- `lib/wallpaper-scan.js`：原始 `project.json` 与 Scene 资源扫描。
- `lib/inventory.js`：清单缓存与扫描签名。
- `docs/adr/0001-webwallgl-in-tree-live-renderer.md`：WebWallGL、Scene／Web、降级与 Application 排除。
- `lib/webwallgl/renderer.js`：公开渲染 API 的适配方式。
- `lib/occlusion/x11.js`：X11 仅用于可选遮挡检测。
- `package.json` / `package-lock.json`：Node 版本和 WebWallGL `3.0.0` 锁定。

---

**Frozen v1.0：按本规格实施，不再重新讨论 Celery、RePKG、WEwebLoader、Xvfb、Docker Socket 或伪造 Steam 库文件。**
